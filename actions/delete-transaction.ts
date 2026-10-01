import { defineAction } from "@actiondock/sdk";
import { SuiClient } from "../src/sui-client";

export interface DeleteTransactionInput {
  transId: string;
  bookId?: string;
}

export interface DeleteTransactionOutput {
  success: boolean;
  response?: string;
}

export default defineAction<DeleteTransactionInput, DeleteTransactionOutput>(async (input, ctx) => {
  const client = SuiClient.fromContext(ctx);
  await client.ensureLogin();

  if (input.bookId) {
    await client.switchBook(input.bookId);
  }

  return await client.deleteTransaction(input.transId);
});
