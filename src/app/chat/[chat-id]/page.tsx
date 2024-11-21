import ChatComponent from "@/components/ChatComponent";
import ChatSideBar from "@/components/ChatSideBar";
import PDFViewer from "@/components/PDFViewer";
import { db } from "@/lib/db";
import { chats } from "@/lib/db/schema";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import React from "react";

type Props = {
  params: {
    'chat-id': string; // Adjust this if your parameter name is different
  };
};

const ChatPage = async ({ params: { 'chat-id': chatId } }: Props) => {
  console.log("ChatPage component initiated with chatId:", chatId);

  const { userId } = await auth();
  console.log("Authenticated userId:", userId);

  // Check if the user is authenticated
  if (!userId) {
    console.log("User  not authenticated, redirecting to sign-in.");
    return redirect("/sign-in");
  }

  // Fetch user's chats
  const _chats = await db.select().from(chats).where(eq(chats.userId, userId));
  console.log("Fetched chats for user:", _chats);

  // Check if the user has any chats
  if (!_chats || _chats.length === 0) {
    console.log("No chats found for user, redirecting to home.");
    return redirect("/");
  }

  // Check if the specific chat exists for the user
  const currentChat = _chats.find((chat) => chat.id === parseInt(chatId));
  if (!currentChat) {
    console.log(`Chat with id ${chatId} not found for user, redirecting to home.`);
    return redirect("/");
  }

  console.log("Current chat found:", currentChat);

  // If all checks pass, render the chat page
  return (
    <div className="flex  h-screen overflow-scroll">
      <div className="flex w-full  h-screen overflow-scroll">
        {/* chat sidebar */}
        <div className="flex-[1] h-screen max-w-xs">
          <ChatSideBar chats={_chats} chatId={parseInt(chatId)} />
        </div>
        {/* pdf viewer */}
        <div className="max-h-screen h-screen p-4 overflow-scroll flex-[5]">
          <PDFViewer pdf_url={currentChat.pdfUrl || ""} />
        </div>
        {/* chat component */}
        <div className="flex-[3] h-screen border-l-4 border-l-slate-200">
          <ChatComponent chatId={parseInt(chatId)} />
        </div>
      </div>
    </div>
  );
};

export default ChatPage;