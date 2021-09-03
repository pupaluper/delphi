import React, { useContext } from "react";
import { Api } from "./Api";

export const ApiContext = React.createContext<Api | null>(null);
export const ApiProvider = ApiContext.Provider;

export function useApi(): Api {
  const api = useContext(ApiContext);

  if (!api) {
    throw new Error('Api not found');
  }

  return api
}
