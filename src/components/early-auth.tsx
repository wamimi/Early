"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  PrivyProvider,
  usePrivy,
  useWallets,
  type ConnectedWallet
} from "@privy-io/react-auth";

type EthereumProvider = Awaited<ReturnType<ConnectedWallet["getEthereumProvider"]>>;

type EarlyAuthValue = {
  configured: boolean;
  ready: boolean;
  authenticated: boolean;
  displayName: string;
  walletAddress: string;
  login: () => void;
  logout: () => Promise<void>;
  getEthereumProvider: () => Promise<EthereumProvider>;
  switchChain: (chainId: number) => Promise<void>;
};

const missingProvider = async () => {
  throw new Error("Add NEXT_PUBLIC_PRIVY_APP_ID to .env.local to enable Early accounts.");
};

const EarlyAuthContext = createContext<EarlyAuthValue>({
  configured: false,
  ready: true,
  authenticated: false,
  displayName: "",
  walletAddress: "",
  login: () => window.alert("Add NEXT_PUBLIC_PRIVY_APP_ID to .env.local to enable Early accounts."),
  logout: async () => undefined,
  getEthereumProvider: missingProvider,
  switchChain: missingProvider
});

function PrivyBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { ready: walletsReady, wallets } = useWallets();
  const activeWallet = wallets.find((wallet) => wallet.walletClientType === "privy") ?? wallets[0];
  const email = user?.email?.address;
  const socialName = user?.google?.name ?? user?.twitter?.name;

  const value: EarlyAuthValue = {
    configured: true,
    ready: ready && walletsReady,
    authenticated,
    displayName: socialName || email || (activeWallet?.address ? `${activeWallet.address.slice(0, 6)}...${activeWallet.address.slice(-4)}` : ""),
    walletAddress: activeWallet?.address ?? "",
    login,
    logout,
    getEthereumProvider: async () => {
      if (!activeWallet) {
        throw new Error("Sign in or connect a wallet before creating a private tier.");
      }
      return activeWallet.getEthereumProvider();
    },
    switchChain: async (chainId: number) => {
      if (!activeWallet) {
        throw new Error("Sign in or connect a wallet before creating a private tier.");
      }
      await activeWallet.switchChain(chainId);
    }
  };

  return <EarlyAuthContext.Provider value={value}>{children}</EarlyAuthContext.Provider>;
}

export function EarlyAuthProvider({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId) {
    return <EarlyAuthContext.Provider value={{
      configured: false,
      ready: true,
      authenticated: false,
      displayName: "",
      walletAddress: "",
      login: () => window.alert("Add NEXT_PUBLIC_PRIVY_APP_ID to .env.local to enable Early accounts."),
      logout: async () => undefined,
      getEthereumProvider: missingProvider,
      switchChain: missingProvider
    }}>{children}</EarlyAuthContext.Provider>;
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "google", "twitter", "wallet"],
        appearance: {
          theme: "light",
          accentColor: "#111411",
          logo: "/early-logo.svg",
          showWalletLoginFirst: false
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets"
          }
        }
      }}
    >
      <PrivyBridge>{children}</PrivyBridge>
    </PrivyProvider>
  );
}

export function useEarlyAuth() {
  return useContext(EarlyAuthContext);
}
