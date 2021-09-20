import React, { useContext, useMemo } from "react";
import { Api } from "./Api";

export const ApiContext = React.createContext<Api | null>(null);

export const ApiProvider: React.FC = (props) => {
  const api = useMemo(() => new Api(), []);

  return <ApiContext.Provider value={api} {...props} />;
};

export function useApi(): Api {
  const api = useContext(ApiContext);

  if (!api) {
    throw new Error("Api not found");
  }

  return api;
}
