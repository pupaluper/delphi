export class DeferredPromise<V> {
  public promise: Promise<V>;
  public resolve!: (value: V | PromiseLike<V>) => void;
  public reject!: (reason?: any) => void;
  public status: "pending" | "resolved" | "rejected" = "pending";

  constructor() {
    this.promise = new Promise<V>((resolve, reject) => {
      this.reject = (error) => {
        this.status = this.status === "pending" ? "rejected" : this.status;
        reject(error);
      };
      this.resolve = (value) => {
        this.status = this.status === "pending" ? "resolved" : this.status;
        resolve(value);
      };
    });
  }
}
