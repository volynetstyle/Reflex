// @ts-ignore

type FC<P> = (p: P) => unknown;

const ArrowComponent: FC<{}> = ({ }) => {
    const [value, setValue] = createSignal(0);

    createEffect(() => {
        console.log(value())
    })

    return (
        <div data-value={value} onClick={setValue((prev) => prev + 1)}>
            {value}
        </div>
    );
}

function FucntionComponent({ id, someValue }: { types }) {
    const [value, setValue] = createSignal(0);

    createEffect(() => {
        console.log(value())
    })

    return (
        <section {id} {someValue} or id={id}>
            <div data-value={value} onClick={setValue((prev) => prev + 1)}>
                {value}
            </div>
            <ArrowComponent />
        </section>
    );
}