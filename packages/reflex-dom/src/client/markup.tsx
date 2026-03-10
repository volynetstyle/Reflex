var otherwise = false;
var always = true;

const Component = (id: number) => {
  const isSellted = boolean(true);

  const count = signal(0);

  const fib = computed((f0) => {
    if (count >= 2) {

    }
  });

  return (
    <div>
      {when}
        <section>Show some sellted state here</section>
        <section>Show some sellted state here</section>
        <section>Show some sellted state here</section>
        <section>Show some sellted state here</section>

      {otherwise && !id}
      <section>Show some sellted state here</section>

      {always} 
      <footer>
        
      </footer>
    </div>
  );
};

