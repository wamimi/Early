type Eip1193RequestArguments = {
  method: string;
  params?: unknown[] | Record<string, unknown>;
};

type Eip1193Provider = {
  request: <T = unknown>(args: Eip1193RequestArguments) => Promise<T>;
};

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

export {};
