import React, { useCallback } from "react";
import Grid from "@material-ui/core/Grid";
import Button from "@material-ui/core/Button";
import CircularProgress from "@material-ui/core/CircularProgress";
import Card from "@material-ui/core/Card";
import CardContent from "@material-ui/core/CardContent";
import Typography from "@material-ui/core/Typography";

import { useApi } from "../../api";
import { useCommunication } from "../../utils";
import { TokenAmount } from "@akropolis-web/primitives";
import { makeStyles } from "@material-ui/core";

type Props = {
  account: string;
  balance: TokenAmount;
};

export const WithdrawForm: React.FC<Props> = ({ account, balance }) => {
  const classes = useStyles();
  const api = useApi();

  const withdrawing = useCommunication(() => {
    return api.staking.withdraw(account);
  }, [api, account]);

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = useCallback(
    (event) => {
      event.preventDefault();
      withdrawing.execute();
    },
    [withdrawing]
  );

  return (
    <Card variant="outlined" className={classes.card}>
      <CardContent>
        <Grid
          container
          spacing={1}
          component="form"
          alignItems="center"
          onSubmit={handleSubmit}
        >
          <Grid item>
            <Typography>
              Your balance: {balance.toFormattedString(4)}
            </Typography>
          </Grid>
          <Grid item xs>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={balance.isZero() || withdrawing.status === "pending"}
            >
              Withdraw
              {withdrawing.status === "pending" && (
                <>
                  {" "}
                  <CircularProgress color="inherit" size={24} />
                </>
              )}
            </Button>
          </Grid>
          {withdrawing.error && (
            <Grid item xs={12}>
              <Typography color="error">{withdrawing.error}</Typography>
            </Grid>
          )}
        </Grid>
      </CardContent>
    </Card>
  );
};

const useStyles = makeStyles({
  card: {
    height: "100%",
  },
});
