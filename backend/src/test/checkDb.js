import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  const projects = await mongoose.connection.db.collection("projects").find({}).toArray();
  console.log("Projects count:", projects.length);
  for (const p of projects) {
    console.log(`- Project ID: ${p._id}, Name: "${p.name}", Owner: ${p.owner}, githubRepo:`, p.githubRepo);
  }

  const indexes = await mongoose.connection.db.collection("repositoryindexes").find({}).toArray();
  console.log("\nRepositoryIndexes count:", indexes.length);
  for (const idx of indexes) {
    console.log(`- Index ID: ${idx._id}, Project: ${idx.project}, Branch: "${idx.branch}", Status: "${idx.status}", Progress: ${idx.progress}%, Files: ${idx.indexedFiles}/${idx.totalFiles}, Chunks: ${idx.totalChunks}, Error: ${idx.error}`);
  }

  const chunkCount = await mongoose.connection.db.collection("codechunks").countDocuments();
  console.log("\nTotal CodeChunks in DB:", chunkCount);

  if (chunkCount > 0) {
    const sampleChunks = await mongoose.connection.db.collection("codechunks").find({}).limit(5).toArray();
    for (const c of sampleChunks) {
      console.log(`- Chunk: Project=${c.project}, Branch="${c.branch}", Path="${c.filePath}", Symbol="${c.symbolName}", Type="${c.symbolType}", Lines=${c.startLine}-${c.endLine}, EmbeddingLen=${c.embedding?.length || 0}`);
    }
  }

  await mongoose.disconnect();
}

main().catch(console.error);
