import React, { ChangeEvent, useCallback, useState } from "react";
import { combineLatest } from "rxjs";
import { map } from "rxjs/operators";
import Accordion from "@material-ui/core/Accordion";
import AccordionSummary from "@material-ui/core/AccordionSummary";
import AccordionDetails from "@material-ui/core/AccordionDetails";
import ExpandMore from "@material-ui/icons/ExpandMore";
import Grid from "@material-ui/core/Grid";
import Select from "@material-ui/core/Select";
import MenuItem from "@material-ui/core/MenuItem";
import Box from "@material-ui/core/Box";
import Button from "@material-ui/core/Button";
import CircularProgress from "@material-ui/core/CircularProgress";
import Card from "@material-ui/core/Card";
import CardContent from "@material-ui/core/CardContent";
import Typography from "@material-ui/core/Typography";
import Link from "@material-ui/core/Link";
import { isEqualHex, TokenAmount } from "@akropolis-web/primitives";

import { useApi } from "../../api";
import { RemoteData, useCommunication, useSubscribable } from "../../utils";
import { Loading } from "../Loading";
import { SavingsPool } from "../../types";
import Alert from "@material-ui/lab/Alert";
import Divider from "@material-ui/core/Divider";

export const HACKED_SAVINGS_POOLS = [
  "0x91d7b9a8d2314110d4018c88dbfdcf5e2ba4772e",
  "0x7967ada2a32a633d5c055e2e075a83023b632b4e",
].map((a) => a.toLowerCase());

export const Savings: React.FC = () => {
  const api = useApi();
  const poolsRD = useSubscribable(
    () => combineLatest([api.savings.getProducts$(), api.web3Manager.account$]),
    [api]
  );

  return (
    <>
      <Typography variant="h4" gutterBottom>
        Savings
      </Typography>

      <Card>
        <CardContent>
          <Loading data={poolsRD}>
            {([pools, account]) =>
              !account ? (
                <Typography>Connect to the wallet to see details</Typography>
              ) : (
                <Grid container spacing={2}>
                  {pools.map((pool) => (
                    <Grid item xs={12} md={6} lg={4} key={pool.address}>
                      <Pool pool={pool} account={account} />
                    </Grid>
                  ))}
                </Grid>
              )
            }
          </Loading>
        </CardContent>
      </Card>
    </>
  );
};

export const Pool: React.FC<{ pool: SavingsPool; account: string }> = ({
  pool,
  account,
}) => {
  return (
    <Box clone height="100%">
      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6">
            <Link
              href={getEtherscanLink(pool.address)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {pool.lpToken.name}
            </Link>
          </Typography>
          <PoolDetails account={account} pool={pool} />
        </CardContent>
      </Card>
    </Box>
  );
};

export const PoolDetails: React.FC<{ pool: SavingsPool; account: string }> = ({
  pool,
  account,
}) => {
  const api = useApi();
  const balanceRD = useSubscribable(
    () => api.savings.getUserBalance$(pool.address, account),
    [api]
  );

  const isHackedPool = HACKED_SAVINGS_POOLS.some((poolAddress) =>
    isEqualHex(poolAddress, pool.address)
  );

  return (
    <Loading data={balanceRD}>
      {(balance) => (
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <Box clone fontWeight="bold">
              <Typography gutterBottom>
                Your balance: {balance.toFormattedString()}
              </Typography>
            </Box>
            {isHackedPool && !balance.isZero() && (
              <Alert severity="info">
                This pool was exploited back in November 2020. Please check{" "}
                <Link
                  href="https://akropolis.io/app/exploit-drop"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  this page
                </Link>{" "}
                for more info on compensation
              </Alert>
            )}
          </Grid>
          {!isHackedPool && !balance.isZero() && (
            <>
              <Grid item xs={12}>
                <Divider />
              </Grid>
              <Grid item xs={12}>
                <WithdrawAll pool={pool} account={account} />
              </Grid>
            </>
          )}
        </Grid>
      )}
    </Loading>
  );
};

const WithdrawAll: React.FC<{ pool: SavingsPool; account: string }> = ({
  account,
  pool,
}) => {
  const api = useApi();
  const maxWithdrawAmountsRD: RemoteData<Record<
    string,
    TokenAmount[]
  >> = useSubscribable(
    () =>
      combineLatest([
        combineLatest(
          pool.depositTokens.map(({ address }) =>
            api.savings.getMaxWithdrawAmount$(account, pool.address, address)
          )
        ),
        api.savings.getUserBalance$(pool.address, account),
        api.savings.getProductTVL$(pool.address),
        api.savings.getPoolBalances$(pool.address),
      ]).pipe(
        map(([maxByToken, userBalance, tvl, poolBalances]) => {
          const byToken = Object.fromEntries(
            maxByToken.map((a) => [a.currency.address.toLowerCase(), [a]])
          );

          const userShare = userBalance.div(tvl).toFraction();

          const all = poolBalances.map((b) => b.mul(userShare));

          return {
            ...byToken,
            all,
          };
        })
      ),
    []
  );

  const [token, setToken] = useState(
    pool.depositTokens.length === 1
      ? pool.depositTokens[0].address.toLowerCase()
      : "all"
  );

  const handleChange = useCallback(
    (event: ChangeEvent<{ name?: string; value: unknown }>) => {
      setToken(event.target.value as string);
    },
    []
  );

  const options = pool.depositTokens
    .map((t) => ({
      value: t.address.toLowerCase(),
      label: t.symbol,
    }))
    .concat(
      pool.depositTokens.length > 1
        ? [
            {
              value: "all",
              label: "All tokens",
            },
          ]
        : []
    );

  const withdrawing = useCommunication(
    (tokenAddress: string) => {
      return tokenAddress === "all"
        ? api.savings.withdrawAllTokens({
            from: account,
            poolAddress: pool.address,
          })
        : api.savings.withdrawOneToken({
            from: account,
            poolAddress: pool.address,
            tokenAddress: tokenAddress,
          });
    },
    [api, account, pool.address]
  );

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = useCallback(
    (event) => {
      event.preventDefault();
      withdrawing.execute(token);
    },
    [withdrawing, token]
  );

  return (
    <Grid container spacing={1} component="form" onSubmit={handleSubmit}>
      <Grid item container xs={12} spacing={1}>
        <Grid item>
          <Typography variant="h6">Withdraw</Typography>
        </Grid>
        <Grid item>
          <Select
            label="Choose token"
            value={token}
            readOnly={options.length === 1}
            onChange={handleChange}
          >
            {options.map((o) => (
              <MenuItem value={o.value} key={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </Select>
        </Grid>
      </Grid>
      <Grid item xs={12}>
        <Typography gutterBottom>You will receive (approximately):</Typography>
        <Loading data={maxWithdrawAmountsRD}>
          {(maxWithdrawAmounts) => (
            <>
              <Typography component="ul" gutterBottom>
                {maxWithdrawAmounts[token].map((amount) => (
                  <Typography component="li" key={amount.currency.symbol}>
                    {amount.toFormattedString()}
                  </Typography>
                ))}
              </Typography>
              <Button
                type="submit"
                variant="contained"
                color="primary"
                disabled={withdrawing.status === "pending"}
              >
                Withdraw
                {withdrawing.status === "pending" && (
                  <>
                    {" "}
                    <CircularProgress color="inherit" size={24} />
                  </>
                )}
              </Button>
            </>
          )}
        </Loading>
      </Grid>
      {withdrawing.error && (
        <Grid item xs={12}>
          <Typography color="error">{withdrawing.error}</Typography>
        </Grid>
      )}
    </Grid>
  );
};

function getEtherscanLink(address: string) {
  return `https://etherscan.io/address/${address}`;
}
