import { createHash } from "node:crypto";
import type { ActionContext } from "@actiondock/sdk";

export interface CategoryItem {
  id: string;
  name: string;
  subCat: Array<{ id: string; name: string }>;
}

export interface AccountItem {
  id: string;
  name: string;
}

export interface MemberItem {
  id: string;
  name: string;
}

export interface TallyInfo {
  payoutCategories: CategoryItem[];
  incomeCategories: CategoryItem[];
  accounts: AccountItem[];
  members: MemberItem[];
}

export interface PayoutParams {
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

export interface IncomeParams {
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

export interface TransferParams {
  outAccount: string;
  inAccount: string;
  price: number;
  bookId?: string;
  payTime?: string;
  member?: string;
  memo?: string;
  store?: string;
  project?: string;
  url?: string;
}

export interface AccountDetailParams {
  accountId?: string;
  beginDate: string;
  endDate: string;
  memberIds?: string;
  bookId?: string;
}

export class CookieJar {
  // host -> (cookieName -> cookieValue)
  private jar: Map<string, Map<string, string>> = new Map();

  public getCookies(host: string): string {
    const pairs: string[] = [];
    const seenNames = new Set<string>();

    // 1. Direct host match
    const hostJar = this.jar.get(host);
    if (hostJar) {
      for (const [k, v] of hostJar.entries()) {
        pairs.push(`${k}=${v}`);
        seenNames.add(k);
      }
    }

    // 2. Shared sui.com domain cookies
    for (const [jarHost, map] of this.jar.entries()) {
      if (jarHost === host) continue;
      const isDomainMatch =
        jarHost === ".sui.com" ||
        jarHost === "sui.com" ||
        (host.endsWith(".sui.com") && jarHost.endsWith(".sui.com"));
      if (isDomainMatch) {
        for (const [k, v] of map.entries()) {
          if (!seenNames.has(k)) {
            pairs.push(`${k}=${v}`);
            seenNames.add(k);
          }
        }
      }
    }

    return pairs.join("; ");
  }

  public setCookiesFromResponse(host: string, setCookieHeaders: string[] | string | null | undefined): void {
    if (!setCookieHeaders) return;
    const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];

    for (const header of headers) {
      const parts = header.split(";");
      const mainPart = parts[0]?.trim();
      if (!mainPart) continue;
      const eqIdx = mainPart.indexOf("=");
      if (eqIdx > 0) {
        const name = mainPart.slice(0, eqIdx).trim();
        const value = mainPart.slice(eqIdx + 1).trim();

        // Check if Domain is specified
        let targetHost = host;
        for (const part of parts.slice(1)) {
          const p = part.trim();
          if (p.toLowerCase().startsWith("domain=")) {
            targetHost = p.slice(7).trim();
          }
        }

        let hostJar = this.jar.get(targetHost);
        if (!hostJar) {
          hostJar = new Map();
          this.jar.set(targetHost, hostJar);
        }
        hostJar.set(name, value);
      }
    }
  }

  public toJSON(): Record<string, Record<string, string>> {
    const res: Record<string, Record<string, string>> = {};
    for (const [host, map] of this.jar.entries()) {
      res[host] = Object.fromEntries(map.entries());
    }
    return res;
  }

  public fromJSON(data: Record<string, Record<string, string>>): void {
    this.jar.clear();
    for (const [host, cookies] of Object.entries(data)) {
      this.jar.set(host, new Map(Object.entries(cookies)));
    }
  }

  public isEmpty(): boolean {
    return this.jar.size === 0;
  }

  public clear(): void {
    this.jar.clear();
  }
}

export class SuiClient {
  private static readonly BASE = "https://www.sui.com";
  private static readonly LOGIN_BASE = "https://login.sui.com";
  private static readonly USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.108 Safari/537.36";
  private static readonly MAX_AUTH_REDIRECT = 10;
  private static readonly SESSION_TTL_SECONDS = 30 * 24 * 3600;

  private username: string;
  private password: string;
  private ctx: ActionContext;
  private cookieJar: CookieJar = new CookieJar();
  private memberNameMap: Map<string, string> = new Map();

  constructor(username: string | number, password: string | number, ctx: ActionContext) {
    this.username = String(username);
    this.password = String(password);
    this.ctx = ctx;
  }

  public static getCredentials(ctx: ActionContext): { user: string; pass: string } {
    const user =
      ctx.config.get<string>("SUI_USER") ||
      ctx.config.get<string>("sui.user") ||
      "";
    const pass =
      ctx.config.get<string>("SUI_PASSWORD") ||
      ctx.config.get<string>("sui.password") ||
      "";

    if (!user || !pass) {
      throw new Error(
        "未配置随手记账号：请先在 ActionDock 配置中设置 SUI_USER / SUI_PASSWORD（或 sui.user / sui.password）"
      );
    }
    return { user: String(user), pass: String(pass) };
  }

  public static fromContext(ctx: ActionContext): SuiClient {
    const creds = SuiClient.getCredentials(ctx);
    return new SuiClient(creds.user, creds.pass, ctx);
  }

  private getSessionKey(): string {
    const hash = createHash("sha1").update(this.username).digest("hex").slice(0, 16);
    return `session:${hash}`;
  }

  public async restoreSession(): Promise<boolean> {
    const saved = await this.ctx.state.get<{ cookies: Record<string, Record<string, string>> }>(
      this.getSessionKey()
    );
    if (!saved || !saved.cookies) {
      return false;
    }
    this.cookieJar.fromJSON(saved.cookies);
    this.ctx.log.info("已从共享状态恢复随手记会话");
    return true;
  }

  public async saveSession(): Promise<void> {
    await this.ctx.state.set(
      this.getSessionKey(),
      { cookies: this.cookieJar.toJSON() },
      SuiClient.SESSION_TTL_SECONDS
    );
    this.ctx.log.debug("随手记会话已同步到共享状态");
  }

  public async isSessionAlive(): Promise<boolean> {
    try {
      const resp = await this.rawRequest(
        `${SuiClient.BASE}/tally/new.do`,
        "GET",
        undefined,
        false
      );
      const loc = resp.headers.get("Location") || resp.headers.get("location");
      if (loc && (loc.includes("login") || loc.includes("auth.do"))) {
        return false;
      }
      const body = await resp.text();
      return !body.includes("login.do") && body.includes("levelSelect-payout");
    } catch {
      return false;
    }
  }

  public async ensureLogin(): Promise<void> {
    if ((await this.restoreSession()) && (await this.isSessionAlive())) {
      this.ctx.log.info("复用缓存的随手记会话，跳过登录");
      return;
    }
    this.cookieJar.clear();
    await this.login();
  }

  public async login(): Promise<void> {
    this.ctx.log.info("开始登录随手记");

    // 1. 获取验证码信息
    const vcText = await this.http(
      `${SuiClient.LOGIN_BASE}/login.do?opt=vccode`,
      "GET"
    );
    let vc: { uid: string; vccode: string };
    try {
      vc = JSON.parse(vcText);
    } catch (e: any) {
      throw new Error(`获取验证码失败: ${e.message}, 返回内容: ${vcText}`);
    }

    // 2. 密码三次 SHA1: sha1(pwd) -> sha1(user + ..) -> sha1(.. + vccode)
    let pwd = this.hexSha1(this.password);
    pwd = this.hexSha1(this.username + pwd);
    pwd = this.hexSha1(pwd + vc.vccode);

    // 3. 登录请求
    const loginParams = new URLSearchParams({
      email: this.username,
      status: "0",
      password: pwd,
      uid: vc.uid,
    });
    const loginResp = await this.rawRequest(`${SuiClient.LOGIN_BASE}/login.do?${loginParams.toString()}`, "GET");
    const loginResult = await loginResp.text();
    if (loginResult.includes('"status":"no"')) {
      throw new Error("随手记登录失败：账号或密码错误，请检查 SUI_USER / SUI_PASSWORD 配置");
    }

    // 4. 跟随 auth.do 跳转链
    await this.authRedirect("GET", `${SuiClient.LOGIN_BASE}/auth.do`, {}, 1);

    // 5. 保存会话
    await this.saveSession();
    this.ctx.log.info("登录随手记成功，会话已缓存");
  }

  private async authRedirect(
    method: "GET" | "POST",
    address: string,
    data: Record<string, string>,
    count: number
  ): Promise<void> {
    if (count > SuiClient.MAX_AUTH_REDIRECT) {
      throw new Error(`随手记登录跳转次数超过 ${SuiClient.MAX_AUTH_REDIRECT}，登录失败`);
    }

    const resp = await this.rawRequest(
      address,
      method,
      method === "POST" ? data : undefined,
      false
    );

    // Handle HTTP redirect 301/302
    if (resp.status === 301 || resp.status === 302 || resp.status === 303 || resp.status === 307) {
      const loc = resp.headers.get("Location") || resp.headers.get("location");
      if (loc) {
        let redirectUrl = loc;
        if (redirectUrl.startsWith("/")) {
          const parsed = new URL(address);
          redirectUrl = `${parsed.origin}${redirectUrl}`;
        }
        await this.authRedirect("GET", redirectUrl, {}, count + 1);
        return;
      }
    }

    const html = await resp.text();

    if (!html.includes("document.forms[0].submit()")) {
      return;
    }

    const formMatch = html.match(/<form[\s\S]*?>[\s\S]*?<\/form>/i);
    if (!formMatch) {
      return;
    }
    const formHtml = formMatch[0];

    const actionMatch = formHtml.match(/action=["']?([^"'>\s]+)/i);
    const methodMatch = formHtml.match(/method=["']?([^"'>\s]+)/i);
    let nextAction = actionMatch ? actionMatch[1] : address;
    const nextMethod = (methodMatch ? methodMatch[1].toUpperCase() : "GET") as "GET" | "POST";

    if (nextAction.startsWith("/")) {
      const parsedUrl = new URL(address);
      nextAction = `${parsedUrl.origin}${nextAction}`;
    }

    const inputs: Record<string, string> = {};
    const tagRegex = /<input\b([^>]*)>/gi;
    let tagMatch: RegExpExecArray | null;
    while ((tagMatch = tagRegex.exec(formHtml)) !== null) {
      const attrStr = tagMatch[1];
      const nameMatch = attrStr.match(/\bname=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const valueMatch = attrStr.match(/\bvalue=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      if (nameMatch) {
        const name = nameMatch[1] ?? nameMatch[2] ?? nameMatch[3] ?? "";
        const value = valueMatch ? (valueMatch[1] ?? valueMatch[2] ?? valueMatch[3] ?? "") : "";
        inputs[name] = value;
      }
    }

    await this.authRedirect(nextMethod, nextAction, inputs, count + 1);
  }

  public async switchBook(bookId: string): Promise<void> {
    this.ctx.log.info(`切换随手记账本: ${bookId}`);
    const params = new URLSearchParams({
      opt: "switch",
      switchId: bookId,
      return: `${SuiClient.BASE}/tally/new.do`,
    });
    await this.http(`${SuiClient.BASE}/systemSet/book.do?${params.toString()}`, "GET");
  }

  public async initTallyInfo(): Promise<TallyInfo> {
    this.ctx.log.info("初始化收支类型及账户信息");
    const html = await this.http(`${SuiClient.BASE}/tally/new.do`, "GET");

    const payout = this.parseCategories(html, "payout");
    const income = this.parseCategories(html, "income");
    const accounts = this.parseAccounts(html);
    const members = this.parseMembers(html);

    this.ctx.log.info(
      `初始化完成：支出类型 ${payout.length} 组，收入类型 ${income.length} 组，账户 ${accounts.length} 个，成员 ${members.length} 个`
    );

    return {
      payoutCategories: payout,
      incomeCategories: income,
      accounts,
      members,
    };
  }

  private parseCategories(html: string, type: "payout" | "income"): CategoryItem[] {
    const categories: CategoryItem[] = [];
    const lv2UlRegex = new RegExp(`<ul[^>]*id=["']ls-ul2-${type}-([0-9]+)["'][^>]*>([\\s\\S]*?)<\\/ul>`, "gi");
    let m: RegExpExecArray | null;

    while ((m = lv2UlRegex.exec(html)) !== null) {
      const lv1Id = m[1];
      const lv2Html = m[2];

      const lv1LiMatch = html.match(
        new RegExp(`<li[^>]*id=["']ls-li[0-9]*-${type}-${lv1Id}["'][^>]*>[\\s\\S]*?<span[^>]*title=["']([^"']*)["']`, "i")
      );
      const lv1Name = lv1LiMatch ? lv1LiMatch[1] : "";

      const subCat: Array<{ id: string; name: string }> = [];
      const subLiRegex = /<li[^>]*id=["']([^"']+)["'][^>]*>([\s\S]*?)<\/li>/gi;
      let sm: RegExpExecArray | null;

      while ((sm = subLiRegex.exec(lv2Html)) !== null) {
        const subFullId = sm[1];
        const subContent = sm[2];
        const subId = subFullId.replace(/^ls-li[0-9]*-(?:payout|income)-?/, "");
        const titleMatch = subContent.match(/<span[^>]*title=["']([^"']*)["']/i);
        const subName = titleMatch ? titleMatch[1] : "";

        if (subId && subName && !subFullId.includes("add") && !subName.includes("添加")) {
          subCat.push({ id: subId, name: subName });
        }
      }

      categories.push({ id: lv1Id, name: lv1Name, subCat });
    }

    return categories;
  }

  private parseAccounts(html: string): AccountItem[] {
    const accounts: AccountItem[] = [];
    const accountsUlMatch = html.match(/<ul[^>]*id=["']ul_tb-inAccount-5["'][^>]*>([\s\S]*?)<\/ul>/i);
    if (!accountsUlMatch) return accounts;

    const liRegex = /<li[^>]*id=["']([^"']+)["'][^>]*>([\s\S]*?)<\/li>/gi;
    let match: RegExpExecArray | null;
    while ((match = liRegex.exec(accountsUlMatch[1])) !== null) {
      const fullId = match[1];
      const text = match[2].replace(/<[^>]+>/g, "").trim();
      const id = fullId.replace(/^tb-inAccount-5_v_/, "") || (fullId.length > 17 ? fullId.substring(17) : fullId);
      accounts.push({ id, name: text });
    }
    return accounts;
  }

  private parseMembers(html: string): MemberItem[] {
    const members: MemberItem[] = [];
    const memberUlMatch = html.match(/<ul[^>]*id=["']ul_tb-member["'][^>]*>([\s\S]*?)<\/ul>/i);
    if (!memberUlMatch) return members;

    const liRegex = /<li[^>]*id=["']([^"']+)["'][^>]*>([\s\S]*?)<\/li>/gi;
    let match: RegExpExecArray | null;
    while ((match = liRegex.exec(memberUlMatch[1])) !== null) {
      const fullId = match[1];
      const liContent = match[2];
      const prefix = "tb-member_v_";
      const mid = fullId.startsWith(prefix) ? fullId.substring(prefix.length) : fullId;
      if (mid !== "0") {
        const titleMatch = liContent.match(/title=["']([^"']*)["']/i);
        const text = liContent.replace(/<[^>]+>/g, "").trim();
        const name = titleMatch ? titleMatch[1] : text;
        members.push({ id: mid, name });
      }
    }
    return members;
  }

  private async ensureMemberNameMap(): Promise<void> {
    if (this.memberNameMap.size > 0) return;
    try {
      const html = await this.http(`${SuiClient.BASE}/tally/new.do`, "GET");
      const members = this.parseMembers(html);
      for (const m of members) {
        this.memberNameMap.set(m.id, m.name);
      }
      this.ctx.log.debug(`成员映射加载完成，共 ${this.memberNameMap.size} 位成员`);
    } catch (e: any) {
      this.ctx.log.warn(`成员映射加载失败，流水将缺少成员名称: ${e.message}`);
    }
  }

  public async payout(params: PayoutParams): Promise<{ success: boolean; response: string }> {
    const now = this.formatDate(new Date());
    const data: Record<string, string> = {
      id: "0",
      category: params.category || "",
      store: params.store || "0",
      time: params.payTime || now,
      project: params.project || "0",
      member: params.member || "0",
      memo: params.memo || "",
      url: params.url || "",
      out_account: params.outAccount || "0",
      in_account: params.inAccount || "0",
      debt_account: params.debtAccount || "",
      account: params.account || "0",
      price: String(params.price),
      price2: "",
    };
    return this.tally("payout", data);
  }

  public async income(params: IncomeParams): Promise<{ success: boolean; response: string }> {
    const now = this.formatDate(new Date());
    const data: Record<string, string> = {
      id: "0",
      category: params.category || "",
      store: params.store || "0",
      time: params.payTime || now,
      project: params.project || "0",
      member: params.member || "0",
      memo: params.memo || "",
      url: params.url || "",
      out_account: params.outAccount || "0",
      in_account: params.inAccount || "0",
      debt_account: params.debtAccount || "",
      account: params.account || "0",
      price: String(params.price),
      price2: "",
    };
    return this.tally("income", data);
  }

  public async transfer(params: TransferParams): Promise<{ success: boolean; response: string }> {
    const now = this.formatDate(new Date());
    const data: Record<string, string> = {
      id: "0",
      store: params.store || "0",
      time: params.payTime || now,
      project: params.project || "0",
      member: params.member || "0",
      memo: params.memo || "",
      url: params.url || "",
      out_account: params.outAccount,
      in_account: params.inAccount,
      debt_account: "",
      account: "0",
      price: String(params.price),
      price2: "",
    };
    return this.tally("transfer", data);
  }

  private async tally(kind: string, data: Record<string, string>): Promise<{ success: boolean; response: string }> {
    const body = await this.http(`${SuiClient.BASE}/tally/${kind}.rmi`, "POST", data);
    this.ctx.log.info(`${kind} 记账请求完成`);
    return { success: true, response: body };
  }

  public async accountDetail(params: AccountDetailParams): Promise<{ details: any[]; total: number }> {
    await this.ensureMemberNameMap();

    const requestPage = async (page: number): Promise<any> => {
      const formData: Record<string, string> = {
        opt: "list2",
        beginDate: params.beginDate,
        endDate: params.endDate,
        cids: "0",
        bids: params.accountId || "0",
        sids: "0",
        pids: "0",
        memids: params.memberIds || "0",
        order: "",
        isDesc: "0",
        page: String(page),
        note: "",
        mids: "0",
      };
      const text = await this.http(`${SuiClient.BASE}/tally/new.rmi`, "POST", formData);
      return JSON.parse(text);
    };

    const firstPageReport = await requestPage(1);
    const details: any[] = [];
    this.extractDetailsInPage(firstPageReport, details);

    const pageCount = Number(firstPageReport?.pageCount) || 1;
    for (let p = 2; p <= pageCount; p++) {
      const pageReport = await requestPage(p);
      this.extractDetailsInPage(pageReport, details);
    }

    this.ctx.log.info(`账户流水查询完成，共 ${details.length} 条（${pageCount} 页）`);
    return { details, total: details.length };
  }

  private extractDetailsInPage(report: any, targetList: any[]): void {
    const groups = report?.groups;
    if (!Array.isArray(groups)) return;

    for (const group of groups) {
      const list = group?.list;
      if (!Array.isArray(list)) continue;

      for (const item of list) {
        if (!item || typeof item !== "object") continue;
        const detail = { ...item };

        const dateInfo = detail.date;
        if (dateInfo && typeof dateInfo === "object") {
          const y = dateInfo.year;
          const m = dateInfo.month;
          const d = dateInfo.date;
          if (y !== undefined && m !== undefined && d !== undefined) {
            const yearStr = String(1900 + Number(y)).padStart(4, "0");
            const monthStr = String(Number(m) + 1).padStart(2, "0");
            const dayStr = String(Number(d)).padStart(2, "0");
            detail.sdate = `${yearStr}${monthStr}${dayStr}`;
          }
        }

        const mid = detail.memberId ? String(detail.memberId) : undefined;
        if (mid && this.memberNameMap.has(mid)) {
          detail.memberName = this.memberNameMap.get(mid);
        }

        targetList.push(detail);
      }
    }
  }

  public async deleteTransaction(transId: string): Promise<{ success: boolean; response: string }> {
    this.ctx.log.info(`删除流水记录: transId=${transId}`);
    const body = await this.http(
      `${SuiClient.BASE}/tally/new.rmi`,
      "POST",
      { opt: "del", transId },
      { "x-requested-with": "XMLHttpRequest" }
    );
    return { success: true, response: body };
  }

  public async getReportIndex(): Promise<{ success: boolean; response: string }> {
    const body = await this.http(`${SuiClient.BASE}/report_index.rmi`, "POST", { m: "a" });
    return { success: true, response: body };
  }

  // ==================== HTTP 基础设施 ====================

  private async rawRequest(
    url: string,
    method: "GET" | "POST",
    data?: Record<string, string>,
    followRedirects = false
  ): Promise<Response> {
    const host = new URL(url).host;
    const cookieHeader = this.cookieJar.getCookies(host);

    const headers: Record<string, string> = {
      "User-Agent": SuiClient.USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    };
    if (cookieHeader) {
      headers["Cookie"] = cookieHeader;
    }

    let bodyStr: string | undefined;
    if (method === "POST" && data) {
      const searchParams = new URLSearchParams();
      for (const [k, v] of Object.entries(data)) {
        searchParams.append(k, v ?? "");
      }
      bodyStr = searchParams.toString();
    }

    const resp = await fetch(url, {
      method,
      headers,
      body: bodyStr,
      redirect: followRedirects ? "follow" : "manual",
    });

    const setCookie = resp.headers.getSetCookie
      ? resp.headers.getSetCookie()
      : resp.headers.get("set-cookie");
    if (setCookie) {
      this.cookieJar.setCookiesFromResponse(host, setCookie);
    }

    return resp;
  }

  private async http(
    url: string,
    method: "GET" | "POST",
    data?: Record<string, string>,
    extraHeaders?: Record<string, string>
  ): Promise<string> {
    const host = new URL(url).host;
    const cookieHeader = this.cookieJar.getCookies(host);

    const headers: Record<string, string> = {
      "User-Agent": SuiClient.USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      ...(extraHeaders || {}),
    };
    if (cookieHeader) {
      headers["Cookie"] = cookieHeader;
    }

    let bodyStr: string | undefined;
    if (method === "POST" && data) {
      const searchParams = new URLSearchParams();
      for (const [k, v] of Object.entries(data)) {
        searchParams.append(k, v ?? "");
      }
      bodyStr = searchParams.toString();
    }

    const resp = await fetch(url, {
      method,
      headers,
      body: bodyStr,
      redirect: "manual",
    });

    const setCookie = resp.headers.getSetCookie
      ? resp.headers.getSetCookie()
      : resp.headers.get("set-cookie");
    if (setCookie) {
      this.cookieJar.setCookiesFromResponse(host, setCookie);
    }

    return await resp.text();
  }

  private hexSha1(str: string): string {
    return createHash("sha1").update(str, "utf8").digest("hex");
  }

  private formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day} ${hh}:${mm}`;
  }
}
