# MedLembrete

MVP mobile-first em HTML/CSS/JavaScript, instalável como PWA no Android e no iPhone.

## Recursos
- cadastro/edição/exclusão de medicamentos
- múltiplos horários por medicamento
- confirmação ou pulo de dose
- decremento automático de estoque ao confirmar dose
- alertas de estoque baixo
- histórico de doses (resumido no celular + botão "Histórico detalhado")
- múltiplos perfis (usuário/cuidador)
- acessibilidade (texto ampliado e alto contraste)
- login por e-mail e senha
- recuperação de senha por e-mail
- backup automático em nuvem por usuário
- restauração automática ao entrar em outro Android, iPhone ou computador
- backup manual por exportação/importação JSON
- PWA e cache offline
- notificações locais quando o app está aberto/ativo

## Ativar login e backup em nuvem
O projeto usa **Firebase Authentication + Cloud Firestore**. O código já está pronto, mas cada implantação precisa usar um projeto Firebase próprio.

1. Crie um projeto no Firebase Console.
2. Em **Authentication > Sign-in method**, ative **Email/Password**.
3. Em **Firestore Database**, crie um banco de dados.
4. Em **Configurações do projeto > Seus apps**, adicione um **App da Web**.
5. Copie a configuração do Firebase para `config.js`.
6. Em **Authentication > Settings > Authorized domains**, adicione o domínio da Vercel do MedLembrete.
7. No Firestore, publique as regras abaixo.

### Regras do Firestore
```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

Com essas regras, cada conta autenticada só consegue ler e gravar o próprio documento.

## Como funciona a sincronização
- Ao criar uma conta, o app inicia um espaço de dados próprio na nuvem.
- Cada alteração em medicamentos, doses, estoque, perfis, histórico ou acessibilidade é salva localmente e enviada ao Firestore.
- Ao entrar com a mesma conta em outro aparelho, o app busca o backup e substitui os dados locais pelos dados da conta.
- O login fica persistente no aparelho até o usuário sair.

## Rodar localmente
Use qualquer servidor HTTP estático, por exemplo:
`python -m http.server 8000`
