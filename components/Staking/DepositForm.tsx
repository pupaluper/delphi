import React from "react";
import {
  useForm,
  SubmitHandler,
  Controller,
  useFormState,
} from "react-hook-form";
import BN from "bn.js";
import { map } from "rxjs/operators";
import Grid from "@material-ui/core/Grid";
import Button from "@material-ui/core/Button";
import CircularProgress from "@material-ui/core/CircularProgress";
import Card from "@material-ui/core/Card";
import CardContent from "@material-ui/core/CardContent";
import Typography from "@material-ui/core/Typography";

import { useApi } from "../../api";
import { useSubscribable } from "../../utils";
import { Loading } from "../Loading";
import { StakingPool } from "../../types";
import { DecimalsInput } from "../form/DecimalsInput";
import { combineLatest } from "rxjs";
import { denormolizeAmount, min, TokenAmount } from "@akropolis-web/primitives";
import { makeStyles } from "@material-ui/core";

type FormData = {
  amount: string;
};

type Props = {
  pool: StakingPool;
  account: string;
};

export const DepositForm: React.FC<Props> = ({ account, pool }) => {
  const classes = useStyles();
  const api = useApi();

  const {
    handleSubmit,
    control,
    formState: { errors },
    setError,
  } = useForm<FormData>();

  const { isSubmitting } = useFormState({
    control,
  });

  const onSubmit: SubmitHandler<FormData> = (data) => {
    return api.staking
      .deposit(new TokenAmount(data.amount, pool.depositToken), account)
      .catch((error) => {
        console.log("e", error);
        setError("amount", {
          type: "server",
          message: error.message,
        });
      });
  };

  const maxValueRD = useSubscribable(
    () =>
      combineLatest([
        api.erc20.getBalance$(pool.depositToken, account),
        api.staking.getDepositLimit$(account),
      ]).pipe(
        map(([balance, depositLimit]) => {
          if (depositLimit === null) {
            return balance;
          }

          const maxValueBasedOnAvailableForDeposit =
            balance && denormolizeAmount(depositLimit, balance.currency);

          return min(balance, maxValueBasedOnAvailableForDeposit);
        })
      ),
    [api]
  );

  return (
    <Card variant="outlined" className={classes.card}>
      <CardContent>
        <Grid
          container
          spacing={1}
          component="form"
          onSubmit={handleSubmit(onSubmit)}
        >
          <Grid item xs>
            <Loading data={maxValueRD}>
              {(maxValue) => (
                <>
                  <Controller
                    name="amount"
                    control={control}
                    defaultValue=""
                    render={({ field }) => (
                      <DecimalsInput
                        baseDecimals={pool.depositToken.decimals}
                        maxValue={maxValue}
                        {...field}
                      />
                    )}
                    rules={{
                      required: true,
                      validate: {
                        isPositive: (val) => isPositive(new BN(val)),
                        lessThan: (val) =>
                          lessThan(new BN(val), maxValue.toBN()),
                      },
                    }}
                  />
                  {errors.amount && errors.amount?.type !== "server" && (
                    <Grid item xs={12}>
                      <Typography color="error">
                        {getError(
                          errors.amount?.type,
                          errors.amount?.message,
                          maxValue
                        )}
                      </Typography>
                    </Grid>
                  )}
                </>
              )}
            </Loading>
          </Grid>
          <Grid item xs>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={isSubmitting}
            >
              Deposit
              {isSubmitting && (
                <>
                  {" "}
                  <CircularProgress color="inherit" size={24} />
                </>
              )}
            </Button>
          </Grid>
          {errors.amount?.type === "server" && (
            <Grid item xs={12}>
              <Typography color="error">
                {getError(errors.amount?.type, errors.amount?.message)}
              </Typography>
            </Grid>
          )}
        </Grid>
      </CardContent>
    </Card>
  );
};

const isPositive = (value: BN) => {
  return value.gtn(0);
};

const lessThan = (value: BN, max: BN) => {
  return value.lte(max);
};

const getError = (
  type: string,
  message?: string | undefined,
  amount?: TokenAmount
) => {
  switch (type) {
    case "required": {
      return "This field is required";
    }

    case "isPositive": {
      return "Value should be greater then 0";
    }

    case "lessThan": {
      return `Value should be less than or equal ${amount?.toFormattedString()}`;
    }

    default:
      return message;
  }
};

const useStyles = makeStyles({
  card: {
    height: "100%",
  },
});
