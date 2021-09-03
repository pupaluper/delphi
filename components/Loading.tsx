import React from "react";
import Typography from "@material-ui/core/Typography";
import Skeleton, { SkeletonProps } from "@material-ui/lab/Skeleton";
import { RemoteData } from "../utils/remoteData";

type Props<R, E> = {
  data: R | RemoteData<R, E>;
  children: (data: R) => JSX.Element | null;
  progressProps?: SkeletonProps;
  component?: React.ComponentType;
  loader?: React.ReactNode;
};

export function Loading<R, E>(props: Props<R, E>) {
  const { data, children, loader, progressProps, component } = props;

  const Wrapper = component || React.Fragment;

  if (!(data instanceof RemoteData)) {
    return children(data);
  }

  return data.fold(
    () => <div>Initializing...</div>,
    () => (
      <Wrapper>
        {loader || <Skeleton {...(progressProps as SkeletonProps)} />}
      </Wrapper>
    ),
    (error) => (
      <Wrapper>
        <Typography color="error" variant="body2">
          {error}
        </Typography>
      </Wrapper>
    ),
    children
  );
}
