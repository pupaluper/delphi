import "reflect-metadata";
import React, { useMemo } from "react";
import type { AppProps } from "next/app";
import CssBaseline from "@material-ui/core/CssBaseline";

import { ApiProvider, Api } from "../api";
import { NoSsr } from "../components";

const App: React.FC<AppProps> = ({ Component, pageProps }) => {
  const api = useMemo(() => new Api(), []);
  return (
    <NoSsr>
      <ApiProvider value={api}>
        <CssBaseline />
        <Component {...pageProps} />
      </ApiProvider>
    </NoSsr>
  );
};

export default App;
