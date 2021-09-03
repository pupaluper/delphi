import React, { useCallback } from "react";
import { of, combineLatest } from "rxjs";
import { switchMap } from "rxjs/operators";
import Grid from "@material-ui/core/Grid";
import Box from "@material-ui/core/Box";
import Button from "@material-ui/core/Button";
import Typography from "@material-ui/core/Typography";
import Card from "@material-ui/core/Card";
import CardContent from "@material-ui/core/CardContent";
import CircularProgress from "@material-ui/core/CircularProgress";

import { useApi } from "../../api";
import { isSavingsPool, useCommunication, useSubscribable } from "../../utils";
import { Loading } from "../Loading";
import { PoolRewards, SimplePoolReward } from "../../types";

export const OtherRewards: React.FC = () => {
  const api = useApi();
  const rewardsDataRD = useSubscribable(
    () =>
      api.web3Manager.account$.pipe(
        switchMap((account) =>
          account
            ? combineLatest([
                api.rewards.getAllUserSimpleRewardsByPool$(account),
                of(account),
              ])
            : of(null)
        )
      ),
    [api]
  );

  return (
    <>
      <Typography variant="h4" gutterBottom>
        Other rewards
      </Typography>

      <Card>
        <CardContent>
          <Loading data={rewardsDataRD}>
            {(data) => {
              if (!data) {
                return <Typography>Connect to the wallet to see details</Typography>;
              }

              const [rewardsData, account] = data;
              const hasUserRewards = rewardsData && rewardsData.length > 0;

              if (!hasUserRewards) {
                return <Typography>You don't have any Other rewards</Typography>;
              }

              return (
                <Grid container spacing={3}>
                  <Grid item xs={12}>
                    {hasUserRewards && (
                      <WithdrawButton
                        account={account}
                        rewards={rewardsData
                          .map(({ rewards }) => rewards)
                          .flat()}
                        title="Withdraw all"
                        buttonSize="large"
                      />
                    )}
                  </Grid>
                  {rewardsData.map((poolRewards) => (
                    <Grid item xs={12} key={poolRewards.pool.address}>
                      <PoolRewardsList
                        account={account}
                        rewardData={poolRewards}
                      />
                    </Grid>
                  ))}
                </Grid>
              );
            }}
          </Loading>
        </CardContent>
      </Card>
    </>
  );
};

function PoolRewardsList({
  rewardData,
  account,
}: {
  rewardData: PoolRewards;
  account: string;
}) {
  const currentPool = rewardData.pool;

  return (
    <>
      <Typography variant="h5">
        {isSavingsPool(currentPool)
          ? currentPool.lpToken.name
          : currentPool.name}
      </Typography>

      {rewardData.rewards.map((reward) => (
        <Box marginTop={1} marginLeft={5} key={reward.amount.currency.address}>
          <Grid container spacing={2} alignItems="center" wrap="nowrap">
            <Box clone minWidth={150}>
              <Grid item>{reward.amount.toFormattedString()}</Grid>
            </Box>
            <Grid item>
              <WithdrawButton account={account} rewards={[reward]} />
            </Grid>
          </Grid>
        </Box>
      ))}
    </>
  );
}

function WithdrawButton({
  account,
  rewards,
  title = "Withdraw",
  buttonSize = "medium",
}: {
  account: string;
  rewards: SimplePoolReward[];
  title?: string;
  buttonSize?: "medium" | "large";
}) {
  const api = useApi();

  const withdrawing = useCommunication(
    (account: string, rewards: SimplePoolReward[]) => {
      return api.rewards.withdrawUserRewards(account, rewards);
    },
    [api, account, rewards]
  );

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = useCallback(
    (event) => {
      event.preventDefault();
      withdrawing.execute(account, rewards);
    },
    [withdrawing, account, rewards]
  );

  return (
    <Grid
      container
      spacing={2}
      alignItems="center"
      component="form"
      onSubmit={handleSubmit}
    >
      <Grid item>
        <Button
          type="submit"
          variant="contained"
          color="primary"
          size={buttonSize}
          disabled={withdrawing.status === "pending"}
          style={{ minWidth: 137 }}
        >
          {title}
          {withdrawing.status === "pending" && (
            <>
              {" "}
              <CircularProgress color="inherit" size={24} />
            </>
          )}
        </Button>
      </Grid>
      {withdrawing.error && (
        <Grid item>
          <Typography color="error">{withdrawing.error}</Typography>
        </Grid>
      )}
    </Grid>
  );
}
