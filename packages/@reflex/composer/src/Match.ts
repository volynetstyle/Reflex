class Runtime {
  private bound: Component[] = [];

  async compose(components: Component[]) {
    try {
      for (const c of components) {
        await c.bind(this);
        this.bound.push(c);
      }
    } catch (e) {
      for (let i = this.bound.length - 1; i > 0; --i) {
        this.bound[i].unbind(this);
      }
      throw e;
    }
  }

  destroy() {
    for (let i = this.bound.length - 1; i > 0; --i) {
      this.bound[i].unbind(this);
    }
    this.bound = [];
  }
}
