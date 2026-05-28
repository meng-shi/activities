import { config } from 'dotenv';
import { resolve } from 'path';
import OpenAI from 'openai';

config({ path: resolve(__dirname, '.env.local') });

const client = new OpenAI({
  apiKey: process.env.MINIMAX_API_KEY,
  baseURL: 'https://api.minimax.io/v1'
});

async function test() {
  const response = await client.chat.completions.create({
    model: 'MiniMax-M2.5',
    messages: [
      {
        role: 'user',
        content: 'Return this exact JSON: [{"name":"John","age":30}] Nothing else.'
      }
    ],
    max_tokens: 200,
    temperature: 0.1,
    reasoning_split: true
  });

  console.log('Content:', JSON.stringify(response.choices[0].message.content));
  console.log('Reasoning:', response.choices[0].message.reasoning_content?.slice(0, 200));
}

test().catch(console.error);