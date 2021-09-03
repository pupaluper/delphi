import { InpageConnector } from "@web3-wallets-kit/inpage-connector";
import { ConnectWalletConnector } from "@web3-wallets-kit/connect-wallet-connector";
import { Connector } from "@web3-wallets-kit/core";

import { WalletType } from "./types";
import { INFURA_API_KEY } from "../../../env";

export const ethConnectors: Record<WalletType, Connector> = {
  web3: new InpageConnector(),
  connectWallet: new ConnectWalletConnector({
    chainId: 1,
    rpc: {
      1: `https://mainnet.infura.io/v3/${INFURA_API_KEY}`,
    },
  }),
};
