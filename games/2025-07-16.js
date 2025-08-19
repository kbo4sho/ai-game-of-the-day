(function(){
    var container = document.getElementById('game-of-the-day-stage');
    container.innerHTML = '';
    var canvas = document.createElement('canvas');
    canvas.width = 720;
    canvas.height = 480;
    container.appendChild(canvas);
    var ctx = canvas.getContext('2d');

    var keys = {};
    document.addEventListener('keydown', function(e){ keys[e.key] = true; });
    document.addEventListener('keyup', function(e){ keys[e.key] = false; });

    var player = { x: 50, y: 50, size: 20, speed: 2 };

    var npcs = [
        {
            name: 'Mystic Wizard',
            x: 150, y: 100, size: 30,
            question: '7 + 5 = ?',
            answer: 12,
            color: 'purple',
            answered: false
        },
        {
            name: 'Helper Robot',
            x: 400, y: 200, size: 30,
            question: '15 - 8 = ?',
            answer: 7,
            color: 'gray',
            answered: false
        },
        {
            name: 'Friendly Dragon',
            x: 600, y: 350, size: 30,
            question: '2, 4, 6, ?',
            answer: 8,
            color: 'green',
            answered: false
        }
    ];

    var score = 0;
    var message = '';
    var messageTimer = 0;

    function update(dt){
        var mv = player.speed * dt;
        if(keys['ArrowLeft']) player.x -= mv;
        if(keys['ArrowRight']) player.x += mv;
        if(keys['ArrowUp']) player.y -= mv;
        if(keys['ArrowDown']) player.y += mv;
        // clamp
        if(player.x < 0) player.x = 0;
        if(player.y < 0) player.y = 0;
        if(player.x > canvas.width - player.size) player.x = canvas.width - player.size;
        if(player.y > canvas.height - player.size) player.y = canvas.height - player.size;

        for(var i=0;i<npcs.length;i++){
            var npc = npcs[i];
            if(npc.answered) continue;
            var dx = player.x + player.size/2 - npc.x;
            var dy = player.y + player.size/2 - npc.y;
            var dist = Math.sqrt(dx*dx + dy*dy);
            if(dist < (player.size/2 + npc.size/2) + 5){
                triggerQuestion(npc);
            }
        }

        if(messageTimer > 0){
            messageTimer -= dt;
            if(messageTimer <= 0){
                message = '';
            }
        }
    }

    function triggerQuestion(npc){
        npc.answered = true;
        var resp = prompt(npc.name + ' asks: ' + npc.question);
        if(resp !== null && parseInt(resp) === npc.answer){
            score++;
            message = 'Correct!';
        } else {
            message = 'Incorrect! The answer was ' + npc.answer;
        }
        messageTimer = 120;
    }

    function draw(){
        // background
        ctx.fillStyle = '#acf0ad';
        ctx.fillRect(0,0,canvas.width,canvas.height);

        // npcs
        for(var i=0;i<npcs.length;i++){
            var npc = npcs[i];
            if(npc.answered) continue;
            ctx.fillStyle = npc.color;
            ctx.beginPath();
            ctx.arc(npc.x, npc.y, npc.size/2, 0, Math.PI*2);
            ctx.fill();
            ctx.fillStyle = 'black';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(npc.name, npc.x, npc.y + npc.size/2 + 14);
        }

        // player
        ctx.fillStyle = 'red';
        ctx.beginPath();
        ctx.arc(player.x + player.size/2, player.y + player.size/2, player.size/2, 0, Math.PI*2);
        ctx.fill();

        // HUD
        ctx.fillStyle = 'black';
        ctx.font = '18px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('Score: ' + score, 10, 24);

        // message
        if(message){
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            ctx.fillRect(0, canvas.height/2 - 30, canvas.width, 60);
            ctx.fillStyle = 'black';
            ctx.font = '24px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(message, canvas.width/2, canvas.height/2 + 8);
        }

        // win
        var allDone = npcs.every(function(n){ return n.answered; });
        if(allDone){
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'white';
            ctx.font = '32px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Congratulations!', canvas.width/2, canvas.height/2 - 10);
            ctx.font = '24px sans-serif';
            ctx.fillText('All questions answered.', canvas.width/2, canvas.height/2 + 30);
        }
    }

    var last = 0;
    function loop(ts){
        var delta = (ts - last) / 16;
        if(delta > 4) delta = 4;
        update(delta);
        draw();
        last = ts;
        var allDone = npcs.every(function(n){ return n.answered; });
        if(!allDone) requestAnimationFrame(loop);
    }

    requestAnimationFrame(loop);
})();