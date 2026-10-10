import { pathForRoute, routeFromPath } from './router'

describe('rutas', () => {
  it('lee la ruta bajo la base del despliegue', () => {
    expect(routeFromPath('/', '/')).toBe('inicio')
    expect(routeFromPath('/curvas', '/')).toBe('curvas')
    expect(routeFromPath('/geoarc-app/', '/geoarc-app/')).toBe('inicio')
    expect(routeFromPath('/geoarc-app/sombras', '/geoarc-app/')).toBe('sombras')
    expect(routeFromPath('/geoarc-app/curvas/', '/geoarc-app/')).toBe('curvas') // carpeta copiada por el build
    expect(routeFromPath('/geoarc-app/otra', '/geoarc-app/')).toBe('inicio')
  })

  it('arma la ruta con la base', () => {
    expect(pathForRoute('inicio', '/geoarc-app/')).toBe('/geoarc-app/')
    expect(pathForRoute('curvas', '/geoarc-app/')).toBe('/geoarc-app/curvas')
    expect(pathForRoute('sombras', '/')).toBe('/sombras')
  })
})
