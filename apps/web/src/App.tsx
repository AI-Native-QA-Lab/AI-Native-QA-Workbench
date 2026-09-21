import { createApiClient } from "./api.js";
import { WorkbenchPage } from "./components/WorkbenchPage.js";

export function App() {
  return <WorkbenchPage api={createApiClient()} />;
}
