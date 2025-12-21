class SignalService {
  constructor(private rt: Runtime) {}

  create<T>(initial: T): Signal<T> {
    const id = this.rt.allocNode()
    this.rt.initValue(id, initial)
    return makeSignalFacade(id, this.rt)
  }
}
