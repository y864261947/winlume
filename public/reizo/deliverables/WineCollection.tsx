type Wine = { id: string; name: string; tasting: string; pairing: string };

export const sampleWines: Wine[] = [
  { id: 'cabernet', name: '山麓赤霞珠', tasting: '黑醋栗、雪松与温和香料', pairing: '烤蘑菇与慢炖牛肉' },
  { id: 'chardonnay', name: '山麓霞多丽', tasting: '柑橘、白花与轻盈奶油感', pairing: '烤鱼与奶酪' },
  { id: 'rose', name: '山麓桃红', tasting: '草莓、红樱桃与清爽酸度', pairing: '蔬菜沙拉与轻食' },
];

/** Fictional wine collection for a local website demonstration. */
export function WineCollection({ wines = sampleWines }: { wines?: Wine[] }) {
  return (
    <section aria-labelledby="wine-heading">
      <h2 id="wine-heading">精选酒款</h2>
      <p>以下酒款为虚构品牌样例，不代表实际在售商品。</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 24 }}>
        {wines.map(wine => (
          <article key={wine.id}>
            <h3>{wine.name}</h3>
            <p>风味：{wine.tasting}</p>
            <p>配餐：{wine.pairing}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
