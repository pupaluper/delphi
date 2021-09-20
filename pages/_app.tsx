import "reflect-metadata";
import React from "react";
import type { AppProps } from "next/app";
import Head from 'next/head';
import CssBaseline from "@material-ui/core/CssBaseline";

import { ApiProvider } from "../api";
import { NoSsr } from "../components";

const hrefPrefix = process.env.NEXT_PUBLIC_REPOSITORY_NAME ? `/${process.env.NEXT_PUBLIC_REPOSITORY_NAME}` : '';
const faviconHref = `${hrefPrefix}/favicon.ico`;

const App: React.FC<AppProps> = ({ Component, pageProps }) => {
  return (<>
    <Head>
      <title>Delphi</title>
      <link rel="shortcut icon" href={faviconHref} type="image/x-icon"></link>
    </Head>
    <NoSsr>
      <ApiProvider>
        <CssBaseline />
        <Component {...pageProps} />
      </ApiProvider>
    </NoSsr>
  </>);
};

export default App;
