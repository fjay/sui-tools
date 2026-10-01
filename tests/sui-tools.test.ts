import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { createActionDockApp } from "@actiondock/core";
import { createTestRuntime } from "@actiondock/testing";
import { CookieJar } from "../src/sui-client";
import initTallyInfoAction from "../actions/init-tally-info";
import payoutAction from "../actions/payout";
import incomeAction from "../actions/income";
import transferAction from "../actions/transfer";
import accountDetailAction from "../actions/account-detail";
import deleteTransactionAction from "../actions/delete-transaction";
import getReportIndexAction from "../actions/get-report-index";

describe("CookieJar", () => {
  it("应正确解析并管理 Set-Cookie 响应头", () => {
    const jar = new CookieJar();
    assert.equal(jar.isEmpty(), true);

    jar.setCookiesFromResponse("www.sui.com", [
      "SESSIONID=abc12345; Path=/; HttpOnly",
      "sui_user=testuser; Path=/; Domain=.sui.com",
    ]);

    assert.equal(jar.isEmpty(), false);
    const cookies = jar.getCookies("www.sui.com");
    assert.ok(cookies.includes("SESSIONID=abc12345"));
    assert.ok(cookies.includes("sui_user=testuser"));

    const json = jar.toJSON();
    assert.equal(json["www.sui.com"]["SESSIONID"], "abc12345");

    const newJar = new CookieJar();
    newJar.fromJSON(json);
    assert.equal(newJar.getCookies("www.sui.com"), cookies);
  });
});

describe("Sui Actions & Client Unit Tests", () => {
  it("未配置账号密码时应抛出友好错误", async () => {
    const runtime = createTestRuntime({
      config: {},
    });

    await assert.rejects(
      async () => {
        await runtime.run(initTallyInfoAction, {});
      },
      /未配置随手记账号/
    );
  });

  it("应能使用模拟模式测试 init-tally-info", async () => {
    const sampleHtml = `
      <html>
        <body onload="">
          <div class="levelSelect-payout"></div>
          <ul id="ls-ul1-payout">
            <li id="ls-li1-payout-2065791290801"><span title="餐饮美食">餐饮美食</span></li>
          </ul>
          <ul id="ls-ul2-payout-2065791290801">
            <li id="ls-li2-payout-2065791290802"><span title="早中晚餐">早中晚餐</span></li>
            <li id="ls-li2-payout-add"><span title="添加分类">添加分类</span></li>
          </ul>
          <ul id="ls-ul1-income">
            <li id="ls-li1-income-2065791290803"><span title="职业收入">职业收入</span></li>
          </ul>
          <ul id="ls-ul2-income-2065791290803">
            <li id="ls-li2-income-2065791290804"><span title="工资收入">工资收入</span></li>
          </ul>
          <ul id="ul_tb-inAccount-5">
            <li id="tb-inAccount-5_v_1001">招商银行卡</li>
          </ul>
          <ul id="ul_tb-member">
            <li id="tb-member_v_0" title="无">无</li>
            <li id="tb-member_v_2001" title="张三">张三</li>
          </ul>
        </body>
      </html>
    `;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes("opt=vccode")) {
        return new Response(JSON.stringify({ uid: "uid_123", vccode: "vc_456" }), { status: 200 });
      }
      if (urlStr.includes("tally/new.do")) {
        return new Response(sampleHtml, {
          status: 200,
          headers: { "Content-Type": "text/html; charset=UTF-8" },
        });
      }
      return new Response("OK", { status: 200 });
    }) as any;

    try {
      const runtime = createTestRuntime({
        config: {
          SUI_USER: "test@example.com",
          SUI_PASSWORD: "secret_password",
        },
      });

      const data = await runtime.run(initTallyInfoAction, {});
      assert.equal(data.payoutCategories.length, 1);
      assert.equal(data.payoutCategories[0].name, "餐饮美食");
      assert.equal(data.payoutCategories[0].subCat.length, 1);
      assert.equal(data.payoutCategories[0].subCat[0].name, "早中晚餐");

      assert.equal(data.accounts.length, 1);
      assert.equal(data.accounts[0].name, "招商银行卡");

      assert.equal(data.members.length, 1);
      assert.equal(data.members[0].name, "张三");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("应能正确执行 payout 记账", async () => {
    const originalFetch = globalThis.fetch;
    let postBody = "";
    globalThis.fetch = (async (url: any, opts: any) => {
      const urlStr = String(url);
      if (urlStr.includes("opt=vccode")) {
        return new Response(JSON.stringify({ uid: "uid_123", vccode: "vc_456" }), { status: 200 });
      }
      if (urlStr.includes("tally/new.do")) {
        return new Response('<div class="levelSelect-payout">OK</div>', { status: 200 });
      }
      if (urlStr.includes("tally/payout.rmi")) {
        postBody = String(opts?.body || "");
        return new Response("success", { status: 200 });
      }
      return new Response("OK", { status: 200 });
    }) as any;

    try {
      const runtime = createTestRuntime({
        config: {
          SUI_USER: "test@example.com",
          SUI_PASSWORD: "secret_password",
        },
      });

      const data = await runtime.run(payoutAction, {
        account: "1001",
        price: 35.5,
        category: "2001",
        memo: "午餐测试",
      });

      assert.equal(data.success, true);
      assert.ok(postBody.includes("price=35.5"));
      assert.ok(postBody.includes("account=1001"));
      assert.ok(postBody.includes("category=2001"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("应能正确查询 account-detail 流水并格式化 sdate", async () => {
    const originalFetch = globalThis.fetch;
    const sampleReportJson = JSON.stringify({
      pageCount: 1,
      groups: [
        {
          list: [
            {
              tranId: "tran_9988",
              sId: "tran_9988",
              memberId: "2001",
              date: { year: 126, month: 7, date: 30 },
              buyer: "招商银行卡",
              price: 35.5,
            },
          ],
        },
      ],
    });

    globalThis.fetch = (async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes("opt=vccode")) {
        return new Response(JSON.stringify({ uid: "uid_123", vccode: "vc_456" }), { status: 200 });
      }
      if (urlStr.includes("tally/new.do")) {
        return new Response('<div class="levelSelect-payout"><ul id="ul_tb-member"><li id="tb-member_v_2001" title="张三">张三</li></ul></div>', { status: 200 });
      }
      if (urlStr.includes("tally/new.rmi")) {
        return new Response(sampleReportJson, { status: 200 });
      }
      return new Response("OK", { status: 200 });
    }) as any;

    try {
      const runtime = createTestRuntime({
        config: {
          SUI_USER: "test@example.com",
          SUI_PASSWORD: "secret_password",
        },
      });

      const data = await runtime.run(accountDetailAction, {
        accountId: "1001",
        beginDate: "2026.08.01",
        endDate: "2026.08.31",
      });

      assert.equal(data.total, 1);
      assert.equal(data.details[0].sdate, "20260830");
      assert.equal(data.details[0].memberName, "张三");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("应能正确执行 transfer、delete-transaction、get-report-index", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes("opt=vccode")) {
        return new Response(JSON.stringify({ uid: "uid_123", vccode: "vc_456" }), { status: 200 });
      }
      if (urlStr.includes("tally/new.do")) {
        return new Response('<div class="levelSelect-payout">OK</div>', { status: 200 });
      }
      return new Response("OK", { status: 200 });
    }) as any;

    try {
      const runtime = createTestRuntime({
        config: {
          SUI_USER: "test@example.com",
          SUI_PASSWORD: "secret_password",
        },
      });

      const transRes = await runtime.run(transferAction, {
        outAccount: "1001",
        inAccount: "1002",
        price: 500,
      });
      assert.equal(transRes.success, true);

      const delRes = await runtime.run(deleteTransactionAction, {
        transId: "tran_9988",
      });
      assert.equal(delRes.success, true);

      const repRes = await runtime.run(getReportIndexAction, {});
      assert.equal(repRes.success, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("ActionDockApp Manifest v2 集成测试", () => {
  it("应正确解析包元数据与静态 Action / Playbook 声明", async () => {
    const packageRoot = resolve(import.meta.dirname, "..");
    const app = await createActionDockApp({ packageRoot, inMemory: true });

    const info = await app.info();
    assert.equal(info.id, "team4u.sui");
    assert.equal(info.actionsCount, 7);
    assert.equal(info.playbooksCount, 1);

    const actions = await app.listActions();
    const actionIds = actions.map((a) => a.id).sort();
    assert.deepEqual(actionIds, [
      "account-detail",
      "delete-transaction",
      "get-report-index",
      "income",
      "init-tally-info",
      "payout",
      "transfer",
    ]);

    const initSpec = await app.describeAction("init-tally-info");
    assert.equal(initSpec.id, "init-tally-info");
    assert.ok(initSpec.inputSchema);
    assert.ok(initSpec.outputSchema);

    const playbooks = await app.listPlaybooks();
    assert.equal(playbooks.length, 1);
    assert.equal(playbooks[0].id, "manage-expenses");

    const pbSpec = await app.describePlaybook("manage-expenses");
    assert.equal(pbSpec.id, "manage-expenses");
    assert.deepEqual(pbSpec.actions, [
      "init-tally-info",
      "payout",
      "income",
      "transfer",
      "account-detail",
    ]);
    assert.ok(!pbSpec.content.startsWith("---"));
    assert.ok(pbSpec.content.includes("随手记账务管理操作流程"));

    await app.close();
  });

  it("应能通过 ActionDockApp 调度 Action", async () => {
    const packageRoot = resolve(import.meta.dirname, "..");
    const app = await createActionDockApp({
      packageRoot,
      inMemory: true,
      configOverrides: {
        SUI_USER: "test@example.com",
        SUI_PASSWORD: "secret_password",
      },
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes("opt=vccode")) {
        return new Response(JSON.stringify({ uid: "uid_123", vccode: "vc_456" }), { status: 200 });
      }
      if (urlStr.includes("tally/new.do")) {
        return new Response('<div class="levelSelect-payout">OK</div>', { status: 200 });
      }
      if (urlStr.includes("tally/payout.rmi")) {
        return new Response("success", { status: 200 });
      }
      return new Response("OK", { status: 200 });
    }) as any;

    try {
      const payoutRes = await app.runAction("payout", {
        account: "1001",
        price: 88,
        category: "2001",
        memo: "测试支出",
      });
      assert.equal(payoutRes.ok, true);
      const data = payoutRes.data as { success: boolean };
      assert.equal(data.success, true);
    } finally {
      globalThis.fetch = originalFetch;
      await app.close();
    }
  });
});
