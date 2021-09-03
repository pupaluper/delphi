import React from "react";
import Grid from "@material-ui/core/Grid";
import Box from "@material-ui/core/Box";
import Card from "@material-ui/core/Card";
import CardContent from "@material-ui/core/CardContent";
import Typography from "@material-ui/core/Typography";
import { makeStyles } from "@material-ui/core";

import { useApi } from "../../api";
import { useCommunication, useSubscribable } from "../../utils";
import { Loading } from "../Loading";
import { VestedReward } from "../../types";
import { combineLatest } from "rxjs";
import dayjs from "dayjs";
import { useCallback } from "react";
import Button from "@material-ui/core/Button";
import CircularProgress from "@material-ui/core/CircularProgress";
import Alert from "@material-ui/lab/Alert";

export const VestedRewards: React.FC = () => {
  const api = useApi();
  const accountRD = useSubscribable(() => api.web3Manager.account$, []);

  return (
    <>
      <Typography variant="h4" gutterBottom>
        Rewards under vesting
      </Typography>

      <Card>
        <CardContent>
          <Box flexGrow={1} mt={2}>
            <Loading data={accountRD}>
              {(account) =>
                account ? (
                  <RewardsDetails account={account} />
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

const RewardsDetails: React.FC<{ account: string }> = ({ account }) => {
  const api = useApi();
  const rewardsRD = useSubscribable(
    () =>
      combineLatest([
        api.vestedRewards.getUserVestedRewards$(account),
        api.vestedRewards.getIsContractsPaused$(),
      ]),
    [api, account]
  );

  return (
    <Loading data={rewardsRD}>
      {([reward, isPaused]) => {
        if (isEmptyReward(reward)) {
          return <Typography>You don't have any Vested rewards</Typography>;
        }

        return (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <DetailsRow
                reward={reward}
                account={account}
                isPaused={isPaused}
              />
            </Grid>
          </Grid>
        );
      }}
    </Loading>
  );
};

const DetailsRow: React.FC<{
  reward: VestedReward;
  account: string;
  isPaused: boolean;
}> = ({ reward, account, isPaused }) => {
  const classes = useStyles();

  const api = useApi();
  const claiming = useCommunication(() => api.vestedRewards.claim(account), [
    api,
    account,
  ]);

  const handleClaim = useCallback(() => claiming.execute(), [claiming]);

  return (
    <Grid container spacing={2} alignItems="stretch">
      <Grid item xs={12} md>
        <Card variant="outlined" className={classes.card}>
          <CardContent>
            <Typography variant="h6">Vested</Typography>
            <Typography className={classes.value}>
              {reward.amount.toFormattedString(4)}
            </Typography>
            {!reward.amount.isZero() &&
              (reward.fullUnlockDate ? (
                <Typography>
                  Until {dayjs(reward.fullUnlockDate).format("DD MMM YYYY")}
                </Typography>
              ) : (
                <Typography className={classes.unlocked}>Unlocked</Typography>
              ))}
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} md>
        <Card variant="outlined" className={classes.card}>
          <CardContent>
            <Typography variant="h6">Unlocked</Typography>
            <Typography className={classes.value}>
              {reward.unlocked.toFormattedString(4)}
            </Typography>
            <Grid container spacing={1}>
              <Grid item xs={12}>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleClaim}
                  disabled={
                    reward.unlocked.isZero() ||
                    claiming.status === "pending" ||
                    isPaused
                  }
                >
                  Claim
                  {claiming.status === "pending" && (
                    <>
                      {" "}
                      <CircularProgress color="inherit" size={24} />
                    </>
                  )}
                </Button>
              </Grid>
              {isPaused && (
                <Grid item xs={12}>
                  <Alert severity="info">
                    Claim is paused due to proofs updating. It could take about
                    an hour
                  </Alert>
                </Grid>
              )}
              {claiming.error && (
                <Grid item xs={12}>
                  <Typography color="error">{claiming.error}</Typography>
                </Grid>
              )}
            </Grid>
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} md>
        <Card variant="outlined" className={classes.card}>
          <CardContent>
            <Typography variant="h6">Distributed</Typography>
            <Typography className={classes.value}>
              {reward.distributed.toFormattedString(4)}
            </Typography>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
};

function isEmptyReward({
  amount,
  distributed,
  unlocked: nextDistribution,
}: VestedReward) {
  return amount.isZero() && distributed.isZero() && nextDistribution.isZero();
}

const useStyles = makeStyles({
  card: {
    height: "100%",
  },
  value: {
    fontWeight: "bold",
  },
  unlocked: {
    color: "green",
  },
});
