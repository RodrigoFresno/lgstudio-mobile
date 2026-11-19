# Histórico de atualizações

## 19 de novembro de 2026

- Exportação PNG com canal alfa real, sem incorporar o quadriculado ou os fundos usados apenas na pré-visualização.
- Preservação da transparência da imagem interna e do efeito Liquid Glass.
- Otimização de memória dos quadros de renderização para reduzir falhas em resoluções altas.
- Captura da imagem somente após a conclusão da renderização da GPU.
- Interface padronizada em português brasileiro.
- Prévia mantida na parte superior e controles reunidos em um único painel inferior rolável.


## 19 de novembro de 2026 — ajuste do efeito Liquid Glass na exportação

- Removido o limite de alfa baseado na textura borrada, que apagava a refração, o Fresnel e o brilho das bordas.
- A exportação transparente agora preserva o alfa calculado pela composição SDF do próprio vidro, mantendo a silhueta transparente fora do ícone.
- Shaders WebGL e WebGPU sincronizados.
