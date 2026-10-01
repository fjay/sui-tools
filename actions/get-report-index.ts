import { defineAction } from "@actiondock/sdk";
import { SuiClient } from "../src/sui-client";

export interface GetReportIndexInput {
  bookId?: string;
}

export interface GetReportIndexOutput {
  success: boolean;
  response?: string;
}

export default defineAction<GetReportIndexInput, GetReportIndexOutput>(async (input, ctx) => {
  const client = SuiClient.fromContext(ctx);
  await client.ensureLogin();

  if (input.bookId) {
    await client.switchBook(input.bookId);
  }

  return await client.getReportIndex();
});
