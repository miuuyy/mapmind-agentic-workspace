import React from "react";

type CardProps = {
  title: string;
  className?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
};

export function Card(props: CardProps): React.JSX.Element {
  return (
    <section className={`card ${props.className || ""}`}>
      <div className="cardHeader">
        <div className="cardTitle">{props.title}</div>
        <div>{props.right}</div>
      </div>
      <div className="cardBody">{props.children}</div>
    </section>
  );
}
