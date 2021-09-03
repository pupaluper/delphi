import React from "react";
import Grid from "@material-ui/core/Grid";
import Button from "@material-ui/core/Button";
import Typography from "@material-ui/core/Typography";

import { useApi } from "../api";
import { useSubscribable } from "../utils";
import { Loading } from "./Loading";
import { useCallback } from "react";

export const Connect: React.FC = () => {
  const api = useApi();

  const accountRD = useSubscribable(() => api.web3Manager.account$, [api]);

  const connectToMetamask = useCallback(() => api.web3Manager.connect("web3"), [
    api,
  ]);
  const connectToConnectWallet = useCallback(
    () => api.web3Manager.connect("connectWallet"),
    [api]
  );
  const disconnect = useCallback(() => api.web3Manager.disconnect(), [api]);

  return (
    <div>
      <Loading data={accountRD}>
        {(account) =>
          account ? (
            <Grid container spacing={2} alignItems="center">
              <Grid item>
                <Typography>{getShortAddress(account)}</Typography>
              </Grid>
              <Grid item>
                <Button variant="outlined" color="inherit" onClick={disconnect}>
                  Disconnect
                </Button>
              </Grid>
            </Grid>
          ) : (
            <Grid container spacing={2} alignItems="center">
              <Grid item>
                <Typography>Connect to</Typography>
              </Grid>
              <Grid item>
                <Button
                  variant="outlined"
                  color="inherit"
                  onClick={connectToMetamask}
                >
                  Metamask
                </Button>
              </Grid>
              <Grid item>
                <Button
                  variant="outlined"
                  color="inherit"
                  onClick={connectToConnectWallet}
                >
                  Connect Wallet
                </Button>
              </Grid>
            </Grid>
          )
        }
      </Loading>
    </div>
  );
};

function getShortAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}
