import * as React from 'react';

interface IProps {
  children: React.ReactElement;
}

export function NoSsr(props: IProps) {
  const { children } = props;

  const isServer = !process.browser;

  return isServer ? null : children;
}
