import { defineAction } from "@actiondock/sdk";
import { SuiClient, type TallyInfo } from "../src/sui-client";

export interface InitTallyInfoInput {
  bookId?: string;
}

export type InitTallyInfoOutput = TallyInfo;

export default defineAction<InitTallyInfoInput, InitTallyInfoOutput>(async (input, ctx) => {
  const client = SuiClient.fromContext(ctx);
  await client.ensureLogin();

  if (input.bookId) {
    await client.switchBook(input.bookId);
  }

  return await client.initTallyInfo();
});
