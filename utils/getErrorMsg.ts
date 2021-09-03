export function getErrorMsg(error: any): string {
  return String((error && error.message) || error);
}
