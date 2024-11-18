import { Configuration, OpenAIApi, CreateChatCompletionResponse } from "openai-edge"; 
import { Message } from "ai"; 
import { getContext } from "@/lib/context"; 
import { db } from "@/lib/db"; 
import { chats, messages as _messages } from "@/lib/db/schema"; 
import { eq } from "drizzle-orm"; 
import { NextResponse } from "next/server"; 

// Define the runtime environment for edge functions 
export const runtime = "edge"; 

// Initialize the OpenAI client with the API key
const config = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(config);

export async function POST(req: Request) {
  try {
    // Parse incoming request body for messages and chatId
    const { messages, chatId } = await req.json();

    // Fetch chat information from the database
    const _chats = await db.select().from(chats).where(eq(chats.id, chatId));
    if (_chats.length !== 1) {
      return NextResponse.json({ error: "chat not found" }, { status: 404 });
    }

    // Get the file key and prepare the context from the chat
    const fileKey = _chats[0].fileKey;
    const lastMessage = messages[messages.length - 1];
    const context = await getContext(lastMessage.content, fileKey);

    // Define the system prompt that will be used in the AI model
    const prompt = {
      role: "system",
      content: `AI assistant is a brand new, powerful, human-like artificial intelligence.
      The traits of AI include expert knowledge, helpfulness, cleverness, and articulateness.
      AI is a well-behaved and well-mannered individual.
      AI is always friendly, kind, and inspiring, and he is eager to provide vivid and thoughtful responses to the user.
      AI has the sum of all knowledge in their brain, and is able to accurately answer nearly any question about any topic in conversation.
      AI assistant is a big fan of Pinecone and Vercel.
      START CONTEXT BLOCK
      ${context}
      END OF CONTEXT BLOCK
      AI assistant will take into account any CONTEXT BLOCK that is provided in a conversation.
      If the context does not provide the answer to a question, the AI assistant will say, "I'm sorry, but I don't know the answer to that question".
      AI assistant will not apologize for previous responses, but instead will indicate new information was gained.
      AI assistant will not invent anything that is not drawn directly from the context.
      `,
    };

    // Create the chat completion request with the OpenAI API
    const response = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        prompt,
        ...messages.filter((message: Message) => message.role === "user"),
      ],
      stream: true,
    });

    // Check if the response is in streaming mode
    if (!response || !response.body) {
      throw new Error("No streaming body returned from OpenAI API.");
    }

    // Stream the response from OpenAI
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const stream = new ReadableStream({
      async start(controller) {
        const processStream = async () => {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            return;
          }

          // Decode the chunk and send it to the client
          const decodedText = decoder.decode(value, { stream: true });

          // On each chunk of data, save the user message into the database
          await db.insert(_messages).values({
            chatId,
            content: decodedText,
            role: "system",
          });

          // Enqueue the decoded chunk into the stream to be sent to the client
          controller.enqueue(decodedText);
        };

        // Process the stream in chunks
        while (true) {
          await processStream();
        }
      },
    });

    // Return the streaming response
    return new NextResponse(stream);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
