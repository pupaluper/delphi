import { Erc20Api } from "./modules/Erc20Api";
import { GoogleSheetsApi } from "./modules/GoogleSheetsApi";
import { SavingsModuleApi } from "./modules/SavingsModuleApi";
import { StakingModuleApi } from "./modules/StakingModuleApi";
import { VestedRewardsApi } from "./modules/VestedRewardsApi";
import { RewardsApi } from "./modules/RewardsApi";
import { Web3Manager } from "./modules/Web3Manager";
import { SwapApi } from "./modules/SwapApi";
import { TransactionsApi } from "./modules/TransactionsApi";
import { GasPricesApi } from "./modules/GasPricesApi";

export class Api {
  web3Manager = new Web3Manager();
  gasPrices = new GasPricesApi();
  transactions = new TransactionsApi(this.web3Manager, this.gasPrices);
  savings = new SavingsModuleApi(this.web3Manager, this.transactions);
  erc20 = new Erc20Api(this.web3Manager, this.transactions);
  staking = new StakingModuleApi(
    this.web3Manager,
    this.transactions,
    this.erc20
  );
  googleSheets = new GoogleSheetsApi();
  vestedRewards = new VestedRewardsApi(
    this.web3Manager,
    this.transactions,
    this.googleSheets
  );
  rewards = new RewardsApi(
    this.web3Manager,
    this.transactions,
    this.savings,
    this.staking,
    this.erc20
  );
  swap = new SwapApi(this.web3Manager, this.transactions, this.erc20);
}
