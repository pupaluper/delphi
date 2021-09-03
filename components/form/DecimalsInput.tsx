import React, {
  useCallback,
  useEffect,
  useState,
  useMemo,
  ComponentPropsWithoutRef,
  useRef,
} from "react";
import BN from "bn.js";
import { IToBN, fromBaseUnit, toBaseUnit } from "@akropolis-web/primitives";

import { Button, makeStyles, TextField } from "@material-ui/core";

interface OwnProps {
  baseDecimals: number;
  baseUnitName?: string;
  value: string;
  maxValue?: BN | IToBN;
  onChange: (value: string) => void;
}

type Props = OwnProps &
  Omit<ComponentPropsWithoutRef<typeof TextField>, "onChange">;

const DecimalsInput = React.forwardRef((props: Props, ref) => {
  const {
    onChange,
    baseDecimals,
    value,
    maxValue,
    baseUnitName,
    disabled,
    InputProps,
    ...restInputProps
  } = props;

  const classes = useStyles();

  const [suffix, setSuffix] = useState("");
  const [needToShowEmpty, setNeedToShowEmpty] = useState(
    () => !value || value === "0"
  );

  useEffect(() => {
    needToShowEmpty && value && value !== "0" && setNeedToShowEmpty(false);
  }, [needToShowEmpty, value]);

  useEffect(() => setSuffix(""), [value, baseDecimals]);

  useOnChangeState(
    baseDecimals,
    (prev, cur) => prev !== cur,
    (prevBaseDecimals) => {
      const decimalsDiff = prevBaseDecimals
        ? new BN(baseDecimals - prevBaseDecimals)
        : new BN(0);
      if (decimalsDiff.eqn(0)) {
        return;
      }

      const decimalCorrectionFactor = new BN(10).pow(decimalsDiff);
      const adjustedValue = decimalsDiff.gtn(0)
        ? new BN(value).mul(decimalCorrectionFactor)
        : new BN(value).div(decimalCorrectionFactor);

      onChange(adjustedValue.toString());
    }
  );

  const amount = useMemo(
    () => value && fromBaseUnit(value, baseDecimals) + suffix,
    [value, suffix, baseDecimals]
  );

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const maxFractionLength = baseDecimals;
      const inputValidationRegExp = new RegExp(
        `^$|^\\d+?${
          maxFractionLength > 0 ? `(\\.?\\d{0,${maxFractionLength}})` : ""
        }$`
      );

      if (inputValidationRegExp.test(event.target.value)) {
        if (!event.target.value) {
          setNeedToShowEmpty(true);
          setSuffix("");
          onChange("0");
          return;
        }

        setNeedToShowEmpty(false);

        const nextValue = toBaseUnit(
          event.target.value,
          baseDecimals
        ).toString();

        if (nextValue !== value) {
          onChange(nextValue);
        }

        const suffixMatch = event.target.value.match(
          /^.+?((\.|\.0+)|(\.[0-9]*?(0*)))$/
        );

        if (suffixMatch) {
          const [, , dotWithZeros, , zerosAfterDot] = suffixMatch;
          setSuffix(dotWithZeros || zerosAfterDot || "");
        } else {
          setSuffix("");
        }
      }
    },
    [baseDecimals, value, onChange]
  );

  const handleMaxButtonClick = React.useCallback(() => {
    setSuffix("");
    maxValue && onChange(maxValue.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onChange, maxValue && maxValue.toString()]);

  return (
    <TextField
      {...restInputProps}
      inputRef={ref}
      disabled={disabled}
      value={needToShowEmpty ? "" : amount}
      variant="outlined"
      fullWidth
      onChange={handleInputChange}
      className={classes.root}
      InputProps={{
        className: classes.root,
        endAdornment: maxValue && (
          <Button
            disabled={disabled}
            onClick={handleMaxButtonClick}
            className={classes.maxButton}
          >
            Max
          </Button>
        ),
        ...InputProps,
      }}
    />
  );
});

const useStyles = makeStyles(() => ({
  root: {
    "& .MuiOutlinedInput-input": {
      paddingTop: 0,
      paddingBottom: 0,
    },
  },
  maxButton: {
    fontSize: 12,
    padding: "7.5px 11px",
    minWidth: "unset",
  },
}));

type Predicate<T> = (prevValue: T, value: T) => boolean;
type Handler<T> = (prevValue: T, value: T) => void;

function useOnChangeState<T extends any>(
  value: T,
  needToRunEffect: Predicate<T>,
  effect: Handler<T>
) {
  const valueRef = useRef(value);

  useEffect(() => {
    if (needToRunEffect(valueRef.current, value)) {
      effect(valueRef.current, value);
    }
    valueRef.current = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
}

export { DecimalsInput };
