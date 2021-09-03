export const wallets = ["web3", "connectWallet"] as const;

export type WalletType = typeof wallets[number];
