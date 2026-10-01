import { defineAction } from "@actiondock/sdk";
import { SuiClient } from "../src/sui-client";

export interface TransferInput {
  outAccount: string;
  inAccount: string;
  price: number;
  bookId?: string;
  payTime?: string;
  member?: string;
  memo?: string;
  store?: string;
  project?: string;
}

export interface TransferOutput {
  success: boolean;
  response?: string;
}

export default defineAction<TransferInput, TransferOutput>(async (input, ctx) => {
  const client = SuiClient.fromContext(ctx);
  await client.ensureLogin();

  if (input.bookId) {
    await client.switchBook(input.bookId);
  }

  return await client.transfer(input);
});
