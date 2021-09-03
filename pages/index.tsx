import AppBar from "@material-ui/core/AppBar";
import Box from "@material-ui/core/Box";
import Container from "@material-ui/core/Container";
import Grid from "@material-ui/core/Grid";
import Toolbar from "@material-ui/core/Toolbar";
import Typography from "@material-ui/core/Typography";
import React from "react";

import {
  Connect,
  Savings,
  VestedRewards,
  Staking,
  OtherRewards,
  AdelSwap,
} from "../components";

const IndexPage: React.FC = () => {
  return (
    <div>
      <AppBar position="static">
        <Container maxWidth="lg">
          <Toolbar>
            <Box clone flexGrow={1}>
              <Typography variant="h3">Delphi</Typography>
            </Box>
            <Connect />
          </Toolbar>
        </Container>
      </AppBar>
      <Box clone mt={2}>
        <Container maxWidth="lg">
          <Grid container spacing={6} direction="column">
            <Grid item>
              <Staking />
            </Grid>
            <Grid item>
              <Savings />
            </Grid>
            <Grid item>
              <VestedRewards />
            </Grid>
            <Grid item>
              <OtherRewards />
            </Grid>
            <Grid item>
              <AdelSwap />
            </Grid>
          </Grid>
        </Container>
      </Box>
    </div>
  );
};

export default IndexPage;
