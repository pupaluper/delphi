import "reflect-metadata";
import React, { useMemo } from "react";
import type { AppProps } from "next/app";
import Head from 'next/head';
import CssBaseline from "@material-ui/core/CssBaseline";

import { ApiProvider, Api } from "../api";
import { NoSsr } from "../components";

const hrefPrefix = process.env.NEXT_PUBLIC_REPOSITORY_NAME ? `/${process.env.NEXT_PUBLIC_REPOSITORY_NAME}` : '';
const faviconHref = `${hrefPrefix}/favicon.ico`;

const App: React.FC<AppProps> = ({ Component, pageProps }) => {
  const api = useMemo(() => new Api(), []);
  return (<>
    <Head>
      <title>Delphi</title>
      <link rel="shortcut icon" href={faviconHref} type="image/x-icon"></link>
    </Head>
    <NoSsr>
      <ApiProvider value={api}>
        <CssBaseline />
        <Component {...pageProps} />
      </ApiProvider>
    </NoSsr></>
  );
};

export default App;
