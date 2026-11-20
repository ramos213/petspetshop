# Pets PetShop

Aplicação de demonstração de um pet shop: loja React, API Node.js/Express e banco SQLite. Inclui catálogo, sacola, checkout sem cobrança, agendamento com disponibilidade por duração e profissional, conta de cliente e painel administrativo.

## Requisitos

- Node.js 20 ou superior
- npm

## Executar localmente

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Abra <http://localhost:5173>. A API fica disponível em <http://localhost:3001/api/health>. O banco SQLite e os dados iniciais são criados automaticamente em `data/pets.db`.

Configure `ADMIN_EMAIL`, `ADMIN_PASSWORD` e `JWT_SECRET` no `.env` antes de iniciar a aplicação. Não há credenciais administrativas padrão: a senha é obrigatória e o administrador é criado apenas na primeira inicialização do banco.

Para produção em um único servidor Node, gere a interface com `npm run build`, defina `NODE_ENV=production` e inicie com `npm start`. O Express serve os arquivos de `dist` junto com a API.

### Publicação na Vercel e Render

A Vercel hospeda o frontend e o Render executa a API Express com SQLite em disco persistente. O arquivo `render.yaml` define o serviço e o volume de dados.

1. No Render, crie um Blueprint a partir deste repositório e confira o preço apresentado antes de confirmar. Informe `ADMIN_EMAIL` e uma nova `ADMIN_PASSWORD` nos campos privados; `JWT_SECRET` é gerado automaticamente.
2. No projeto Vercel, adicione `VITE_API_URL` com a URL pública do serviço Render, sem barra final, no ambiente Production e faça um novo deploy.
3. O `CORS_ORIGIN` do serviço Render deve corresponder ao domínio de produção da Vercel. Atualize-o se o domínio mudar.

## Fluxos disponíveis

- **Loja:** filtros por categoria, catálogo, estoque, carrinho, quantidades, frete demonstrativo, retirada e criação de pedidos. O frete fictício custa R$ 12,00 e é grátis a partir de R$ 150,00.
- **Checkout:** Pix/cartão/retirada são opções demonstrativas; não há gateway e nenhuma cobrança é realizada. Produtos marcados como sujeitos a receita são bloqueados no checkout.
- **Agendamento:** seleção de serviço, pet, data e horário; a API usa os horários configurados (padrão: 9h às 18h, de segunda a sábado) e distribui atendimentos entre profissionais, evitando sobreposição pela duração. O cliente pode compartilhar a confirmação pelo WhatsApp configurado.
- **Conta do cliente:** cadastro e login, edição de nome/telefone, pets, pedidos, avaliações elegíveis e cancelamento de agendamentos.
- **Administração:** métricas, pedidos e status, agenda, catálogo/estoque, categorias, equipe, preços e duração dos serviços, aprovação de avaliações e informações comerciais/horários.
- **Avaliações:** o endpoint exige compra entregue ou serviço concluído; o painel aprova antes da publicação.

## Variáveis de ambiente

| Variável | Uso |
| --- | --- |
| `PORT` | Porta da API (padrão `3001`) |
| `JWT_SECRET` | Segredo de assinatura das sessões |
| `DATABASE_PATH` | Caminho do arquivo SQLite (padrão `./data/pets.db`) |
| `CORS_ORIGIN` | Origem permitida para chamadas cross-origin (padrão `http://localhost:5173`) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Conta administrativa inicial |
| `WHATSAPP_NUMBER` | Número do estabelecimento com DDI e DDD, somente dígitos |

As imagens de demonstração usam URLs do Unsplash. Endereço, telefone, redes sociais, serviços e produtos iniciais são fictícios e podem ser personalizados; informações da empresa podem ser atualizadas no painel.

## Observações

Este projeto é uma base funcional para demonstração e portfólio, não um serviço de produção pronto para armazenar dados pessoais reais. Antes de publicar, configure segredos fortes, HTTPS, política de CORS e proteção contra abuso, revise a retenção de dados e use um provedor de pagamentos homologado se for necessário cobrar pedidos. Não salve dados de cartão neste aplicativo.
