import React, { useCallback } from "react";
import { of, combineLatest } from "rxjs";
import { switchMap } from "rxjs/operators";
import Grid from "@material-ui/core/Grid";
import Button from "@material-ui/core/Button";
import Typography from "@material-ui/core/Typography";
import Card from "@material-ui/core/Card";
import CardContent from "@material-ui/core/CardContent";
import CircularProgress from "@material-ui/core/CircularProgress";
import Alert from "@material-ui/lab/Alert";
import dayjs from "dayjs";
import { makeStyles } from "@material-ui/core";
import Link from "@material-ui/core/Link";

import { useApi } from "../../api";
import { useCommunication, useSubscribable } from "../../utils";
import { Loading } from "../Loading";

export const AdelSwap: React.FC = () => {
  const api = useApi();
  const classes = useStyles();
  const swapDataRD = useSubscribable(
    () =>
      api.web3Manager.account$.pipe(
        switchMap((account) =>
          account
            ? combineLatest([
                api.swap.getUserAvailableToClaimAkro$(account),
                api.swap.getUserVAkroBalance$(account),
                api.swap.getUserDueToUnlockAkro$(account),
                api.swap.getSwapDates$(),
              ])
            : of(null)
        )
      ),
    [api]
  );

  return (
    <>
      <Typography variant="h4" gutterBottom>
        ADEL to vAKRO Swap
      </Typography>

      <Card>
        <CardContent>
          <Loading data={swapDataRD}>
            {(data) => {
              if (!data) {
                return (
                  <Typography>Connect to the wallet to see details</Typography>
                );
              }

              const [availableToClaim, balance, dueUnlock, swapDates] = data;

              return (
                <Grid container spacing={2} alignItems="stretch">
                  <Grid item xs={12} md>
                    <Card variant="outlined" className={classes.card}>
                      <CardContent>
                        <Typography variant="h6">
                          AKRO available to claim
                        </Typography>
                        <Typography className={classes.value} gutterBottom>
                          {availableToClaim.toFormattedString()}
                        </Typography>
                        <ClaimButton disabled={availableToClaim.isZero()} />
                      </CardContent>
                    </Card>
                  </Grid>

                  <Grid item xs={12} md>
                    <Card variant="outlined" className={classes.card}>
                      <CardContent>
                        <Typography variant="h6">
                          vAKRO on the connected wallet
                        </Typography>
                        <Typography className={classes.value}>
                          {balance.toFormattedString()}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>

                  <Grid item xs={12} md>
                    <Card variant="outlined" className={classes.card}>
                      <CardContent>
                        <Typography variant="h6">AKRO due to unlock</Typography>
                        <Typography className={classes.value}>
                          {dueUnlock.toFormattedString()}
                        </Typography>
                        <Typography>
                          Until{" "}
                          {dayjs(swapDates.vestingStop).format("DD MMM YYYY")}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>

                  <Grid item xs={12}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="h6">Swap duration</Typography>
                        <Typography>March 1 — June 15, 2021</Typography>
                        <Typography>3.5 months</Typography>
                      </CardContent>
                    </Card>
                  </Grid>

                  <Grid item xs={12}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="h6">Vesting term</Typography>
                        <Typography>24 months</Typography>
                        <Typography>
                          1/24 AKRO due will be available for swap each month
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>

                  <Grid item xs={12}>
                    <Alert severity="info">Swap has ended</Alert>
                  </Grid>

                  <Grid item xs={12}>
                    <Alert severity="info">
                      ADEL to AKRO swap{" "}
                      <Link
                        href="https://www.akropolis.io/_next/static/docs/ADEL%20to%20AKRO%20Token%20Swap%20T&Cs%202021-05-04.pdf"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        terms & conditions
                      </Link>
                    </Alert>
                  </Grid>
                </Grid>
              );
            }}
          </Loading>
        </CardContent>
      </Card>
    </>
  );
};

const useStyles = makeStyles({
  card: {
    height: "100%",
  },
  value: {
    fontWeight: "bold",
  },
});

function ClaimButton({ disabled }: { disabled?: boolean }) {
  const api = useApi();

  const claiming = useCommunication(() => {
    return api.swap.claim();
  }, [api]);

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = useCallback(
    (event) => {
      event.preventDefault();
      claiming.execute();
    },
    [claiming]
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
          disabled={disabled || claiming.status === "pending"}
          style={{ minWidth: 137 }}
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
      {claiming.error && (
        <Grid item>
          <Typography color="error">{claiming.error}</Typography>
        </Grid>
      )}
    </Grid>
  );
}
