import React from "react";
import Grid from "@material-ui/core/Grid";
import Box from "@material-ui/core/Box";
import Card from "@material-ui/core/Card";
import CardContent from "@material-ui/core/CardContent";
import Typography from "@material-ui/core/Typography";
import Link from "@material-ui/core/Link";

import { useApi } from "../../api";
import { useSubscribable } from "../../utils";
import { Loading } from "../Loading";
import { StakingPool } from "../../types";
import { DepositForm } from "./DepositForm";
import { WithdrawForm } from "./WithdrawForm";

export const Staking: React.FC = () => {
  const api = useApi();
  const pool = api.staking.getAdelStakingPool();
  const accountRD = useSubscribable(() => api.web3Manager.account$, []);

  return (
    <>
      <Typography variant="h4" gutterBottom>
        Staking
      </Typography>

      <Card>
        <CardContent>
          <Typography variant="h5">
            <Link
              href={getEtherscanLink(pool.address)}
              target="_blank"
              rel="noopener noreferrer"
            >
              ADEL Staking
            </Link>
          </Typography>
          <Box flexGrow={1} mt={2}>
            <Loading data={accountRD}>
              {(account) =>
                account ? (
                  <PoolDetails account={account} pool={pool} />
                ) : (
                  <Typography>Connect to the wallet to see details</Typography>
                )
              }
            </Loading>
          </Box>
        </CardContent>
      </Card>
    </>
  );
};

export const PoolDetails: React.FC<{ pool: StakingPool; account: string }> = ({
  pool,
  account,
}) => {
  const api = useApi();
  const balanceRD = useSubscribable(
    () => api.staking.getUserBalance$(account),
    [api]
  );

  return (
    <Loading data={balanceRD}>
      {(balance) => (
        <Grid container spacing={2} alignItems="stretch">
          <Grid item xs={12} md>
            <DepositForm pool={pool} account={account} />
          </Grid>
          <Grid item xs={12} md>
            <WithdrawForm balance={balance} />
          </Grid>
        </Grid>
      )}
    </Loading>
  );
};

function getEtherscanLink(address: string) {
  return `https://etherscan.io/address/${address}`;
}
