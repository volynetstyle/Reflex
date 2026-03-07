class GlobalQueue {
  active: boolean = false;

  flush() {
    this.active = true;

    this.active = false;
  }


  
}
