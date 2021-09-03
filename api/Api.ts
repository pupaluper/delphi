import { Erc20Api } from "./modules/Erc20Api";
import { GoogleSheetsApi } from "./modules/GoogleSheetsApi";
import { SavingsModuleApi } from "./modules/SavingsModuleApi";
import { StakingModuleApi } from "./modules/StakingModuleApi";
import { VestedRewardsApi } from "./modules/VestedRewardsApi";
import { RewardsApi } from "./modules/RewardsApi";
import { Web3Manager } from "./modules/Web3Manager";
import { SwapApi } from "./modules/SwapApi";

export class Api {
  web3Manager = new Web3Manager();
  savings = new SavingsModuleApi(this.web3Manager);
  erc20 = new Erc20Api(this.web3Manager);
  staking = new StakingModuleApi(this.web3Manager, this.erc20);
  googleSheets = new GoogleSheetsApi();
  vestedRewards = new VestedRewardsApi(this.web3Manager, this.googleSheets);
  rewards = new RewardsApi(
    this.web3Manager,
    this.savings,
    this.staking,
    this.erc20
  );
  swap = new SwapApi(this.web3Manager, this.erc20);
}
