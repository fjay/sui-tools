import { defineAction } from "@actiondock/sdk";
import { SuiClient } from "../src/sui-client";

export interface IncomeInput {
  account: string;
  price: number;
  category: string;
  bookId?: string;
  payTime?: string;
  member?: string;
  memo?: string;
  store?: string;
  project?: string;
  url?: string;
  outAccount?: string;
  inAccount?: string;
  debtAccount?: string;
}

export interface IncomeOutput {
  success: boolean;
  response?: string;
}

export default defineAction<IncomeInput, IncomeOutput>(async (input, ctx) => {
  const client = SuiClient.fromContext(ctx);
  await client.ensureLogin();

  if (input.bookId) {
    await client.switchBook(input.bookId);
  }

  return await client.income(input);
});
