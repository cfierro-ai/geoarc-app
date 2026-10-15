import { elementosReferencia, longitudEscala } from './referencia'

describe('capa REFERENCIA', () => {
  it('longitud de la barra de escala: 50 / 100 / 500 según el lado del área', () => {
    expect(longitudEscala(120)).toBe(50) // área chica
    expect(longitudEscala(199)).toBe(50)
    expect(longitudEscala(250)).toBe(100) // ~5 ha
    expect(longitudEscala(1500)).toBe(100)
    expect(longitudEscala(2000)).toBe(500) // área grande
    expect(longitudEscala(9000)).toBe(500)
  })

  it('elementos: barra horizontal de la longitud pedida, flecha de norte hacia +Y y las líneas de texto', () => {
    const { segmentos, textos } = elementosReferencia(0, 0, 1, 100, ['GEO·ARC · unidades: metros', 'Fecha: 2026-10-15'])

    // barra: la línea principal va de (0,0) a (100,0)
    const barra = segmentos[0]
    expect([barra[0], barra[barra.length - 1]]).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }])
    // una marca en la mitad (x = 50)
    expect(segmentos.some((s) => s[0].x === 50 && s[1].x === 50)).toBe(true)

    // flecha de norte: algún segmento apunta hacia arriba (termina en un y mayor que el de la barra) y hay rótulo «N»
    const sube = segmentos.find((s) => Math.max(...s.map((p) => p.y)) > 2)
    expect(sube).toBeTruthy()
    expect(textos.some((t) => t.texto === 'N')).toBe(true)

    // rótulo de la escala «100 m» y las líneas de información
    expect(textos.some((t) => t.texto === '100 m')).toBe(true)
    expect(textos.some((t) => t.texto === 'GEO·ARC · unidades: metros')).toBe(true)
    expect(textos.some((t) => t.texto === 'Fecha: 2026-10-15')).toBe(true)
    // todos los textos con la altura dada
    expect(textos.every((t) => t.altura === 1)).toBe(true)

    // recuadro: un segmento cerrado de 5 puntos (rectángulo) que envuelve las líneas
    const recuadro = segmentos.find((s) => s.length === 5 && s[0].x === s[4].x && s[0].y === s[4].y)
    expect(recuadro).toBeTruthy()
  })
})
