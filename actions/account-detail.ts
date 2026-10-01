import { defineAction } from "@actiondock/sdk";
import { SuiClient } from "../src/sui-client";

export interface AccountDetailInput {
  accountId?: string;
  beginDate: string;
  endDate: string;
  memberIds?: string;
  bookId?: string;
}

export interface AccountDetailOutput {
  details: Array<Record<string, any>>;
  total: number;
}

export default defineAction<AccountDetailInput, AccountDetailOutput>(async (input, ctx) => {
  const client = SuiClient.fromContext(ctx);
  await client.ensureLogin();

  if (input.bookId) {
    await client.switchBook(input.bookId);
  }

  return await client.accountDetail(input);
});
