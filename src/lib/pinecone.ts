import { Pinecone, PineconeRecord } from "@pinecone-database/pinecone"; // Import Pinecone
import { downloadFromS3 } from "./s3-server";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import md5 from "md5";
import {
  Document,
  RecursiveCharacterTextSplitter,
} from "@pinecone-database/doc-splitter";
import { getEmbeddings } from "./embeddings";
import { convertToAscii } from "./utils";

export const getPineconeClient = () => {
  console.log("Initializing Pinecone client...");
  return new Pinecone({
    apiKey: process.env.PINECONE_API_KEY!, // Only API key, no environment key
  });
};

type PDFPage = {
  pageContent: string;
  metadata: {
    loc: { pageNumber: number };
  };
};

export async function loadS3IntoPinecone(fileKey: string) {
  try {
    // 1. Obtain the PDF -> download and read from S3
    console.log(`[START] Processing fileKey: ${fileKey}`);
    console.log("Step 1: Downloading file from S3...");
    const file_name = await downloadFromS3(fileKey);
    if (!file_name) {
      console.error("Error: Could not download from S3");
      throw new Error("Could not download from S3");
    }
    console.log(`File downloaded successfully: ${file_name}`);

    console.log("Step 2: Loading PDF into memory...");
    const loader = new PDFLoader(file_name);
    const pages = (await loader.load()) as PDFPage[];
    console.log(`PDF loaded successfully with ${pages.length} pages.`);

    // 2. Split and segment the PDF
    console.log("Step 3: Splitting and segmenting the PDF...");
    const documents = await Promise.all(
      pages.map((page, index) => {
        console.log(`Preparing document for page ${index + 1}`);
        return prepareDocument(page);
      })
    );
    console.log(
      `Document preparation completed. Total segments: ${documents.flat().length}`
    );

    // 3. Vectorize and embed individual documents
    console.log("Step 4: Generating embeddings for documents...");
    const vectors = await Promise.all(
      documents.flat().map((doc, index) => {
        console.log(`Embedding document segment ${index + 1}`);
        return embedDocument(doc);
      })
    );
    console.log(`Embeddings generated for ${vectors.length} segments.`);

    // 4. Upload to Pinecone
    console.log("Step 5: Initializing Pinecone client...");
    const client = await getPineconeClient();
    console.log("Fetching Pinecone index...");
    const pineconeIndex = await client.index("chat-pdf-project-vit");
    const namespaceKey = convertToAscii(fileKey);
    const namespace = pineconeIndex.namespace(namespaceKey);
    console.log(`Using namespace: ${namespaceKey}`);

    console.log("Step 6: Inserting vectors into Pinecone...");
    await namespace.upsert(vectors);
    console.log("Vectors inserted into Pinecone successfully.");

    console.log(`[END] File processed successfully: ${fileKey}`);
    return documents[0];
  } catch (error) {
    console.error("Error in loadS3IntoPinecone:", error);
    throw error;
  }
}

async function embedDocument(doc: Document) {
  try {
    console.log(`Embedding document with metadata:`, doc.metadata);
    const embeddings = await getEmbeddings(doc.pageContent);
    const hash = md5(doc.pageContent);
    console.log(`Embedding successful. Generated hash: ${hash}`);
    return {
      id: hash,
      values: embeddings,
      metadata: {
        text: doc.metadata.text,
        pageNumber: doc.metadata.pageNumber,
      },
    } as PineconeRecord;
  } catch (error) {
    console.error("Error embedding document:", error);
    throw error;
  }
}

export const truncateStringByBytes = (str: string, bytes: number) => {
  console.log(
    `Truncating string to ${bytes} bytes. Original length: ${str.length}`
  );
  const enc = new TextEncoder();
  const truncatedString = new TextDecoder("utf-8").decode(
    enc.encode(str).slice(0, bytes)
  );
  console.log(
    `Truncation completed. Truncated length: ${truncatedString.length}`
  );
  return truncatedString;
};

async function prepareDocument(page: PDFPage) {
  console.log(
    `Preparing document for page: ${page.metadata.loc.pageNumber}. Page content length: ${page.pageContent.length}`
  );
  let { pageContent, metadata } = page;
  pageContent = pageContent.replace(/\n/g, "");
  console.log("Newline characters removed from page content.");

  const splitter = new RecursiveCharacterTextSplitter();
  const docs = await splitter.splitDocuments([
    new Document({
      pageContent,
      metadata: {
        pageNumber: metadata.loc.pageNumber,
        text: truncateStringByBytes(pageContent, 36000),
      },
    }),
  ]);
  console.log(
    `Page ${metadata.loc.pageNumber} split into ${docs.length} document segments.`
  );
  return docs;
}
