import { readFile, writeFile } from "fs/promises";

export default class BasicAuth {
  private __username: string;
  private __password: string;

  public get username(): string {
    return this.__username;
  }

  public get password(): string {
    return this.__password;
  }

  public get token(): string {
    return Buffer.from(`${this.username}:${this.password}`).toString("base64");
  }

  public set username(username: string) {
    if (username.length < 0)
      throw new Error("Username must be at least 1 character long");
    if (username.length > 255)
      throw new Error("Username must be at most 255 characters long");
    if (!/^[a-zA-Z0-9_\-]+$/.test(username))
      throw new Error(
        `Username must only contain alphanumeric characters, underscores and dashes, ${username}`
      );
    this.__username = username;
  }

  public set password(password: string) {
    if (password.length < 0)
      throw new Error("Password must be at least 1 character long");
    if (password.length > 255)
      throw new Error("Password must be at most 255 characters long");
    this.__password = password;
  }

  public static FromUserPass(username: string, password: string): BasicAuth {
    return new BasicAuth(
      Buffer.from(`${username}:${password}`).toString("base64")
    );
  }

  public constructor(token: string) {
    if (token.startsWith("Basic ")) token = token.slice(6);
    const [username, password] = Buffer.from(token, "base64")
      .toString()
      .split(":", 2);
    this.username = username;
    this.password = password;
  }

  public async hasPermissions(): Promise<boolean> {
    const file = JSON.parse(await readFile("./config/users.json", "utf8"));
    if (!file[this.username]) return false;
    return file[this.username] === this.password;
  }

  public async givePermissions(): Promise<void> {
    const file = JSON.parse(await readFile("./config/users.json", "utf8"));
    file[this.username] = this.password;
    await writeFile("./config/users.json", JSON.stringify(file));
  }

  public async revokePermissions(): Promise<void> {
    const file = JSON.parse(await readFile("./config/users.json", "utf8"));
    delete file[this.username];
    await writeFile("./config/users.json", JSON.stringify(file));
  }
}

export async function returnAllUserTokens(): Promise<string[]> {
  const file = JSON.parse(await readFile("./config/users.json", "utf8"));
  return Object.entries(file).map(
    ([username, password]) =>
      `${username}: ${Buffer.from(`${username}:${password}`).toString(
        "base64"
      )}`
  );
}
