(function(){
    var stage = document.getElementById('game-of-the-day-stage');
    var canvas = document.createElement('canvas');
    canvas.width = 720;
    canvas.height = 480;
    stage.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    var keys = {};
    document.addEventListener('keydown', function(e){ keys[e.key] = true; });
    document.addEventListener('keyup', function(e){ keys[e.key] = false; });
    var player = { x: 360, y: 240, size: 20, speed: 3 };
    var coins = 0;
    var npcDefinitions = [
        { name: 'Spark the Fairy', type: 'add', x: 100, y: 100 },
        { name: 'Grumble the Troll', type: 'sub', x: 600, y: 150 },
        { name: 'Twinkle the Sprite', type: 'pattern', x: 350, y: 380 }
    ];
    var npcs = npcDefinitions.map(function(def){
        var npc = { name: def.name, type: def.type, x: def.x, y: def.y, size: 15, active: true, recentlyAsked: false };
        if(def.type === 'add'){
            var a = Math.floor(Math.random()*11) + 5;
            var b = Math.floor(Math.random()*11) + 5;
            npc.question = 'What is ' + a + ' + ' + b + '?';
            npc.answer = a + b;
        } else if(def.type === 'sub'){
            var a = Math.floor(Math.random()*11) + 10;
            var b = Math.floor(Math.random()*9) + 1;
            npc.question = 'What is ' + a + ' - ' + b + '?';
            npc.answer = a - b;
        } else if(def.type === 'pattern'){
            var start = Math.floor(Math.random()*5) + 1;
            var step = Math.floor(Math.random()*4) + 2;
            var second = start + step;
            var fourth = start + 3*step;
            var blank = start + 2*step;
            npc.question = 'Fill the blank: ' + start + ', ' + second + ', __, ' + fourth;
            npc.answer = blank;
        }
        return npc;
    });
    function update(){
        if(keys['ArrowUp']) player.y -= player.speed;
        if(keys['ArrowDown']) player.y += player.speed;
        if(keys['ArrowLeft']) player.x -= player.speed;
        if(keys['ArrowRight']) player.x += player.speed;
        if(player.x < player.size) player.x = player.size;
        if(player.x > canvas.width - player.size) player.x = canvas.width - player.size;
        if(player.y < player.size) player.y = player.size;
        if(player.y > canvas.height - player.size) player.y = canvas.height - player.size;
        npcs.forEach(function(npc){
            if(npc.active){
                var dx = player.x - npc.x;
                var dy = player.y - npc.y;
                var dist = Math.sqrt(dx*dx + dy*dy);
                if(dist < player.size + npc.size){
                    if(!npc.recentlyAsked){
                        npc.recentlyAsked = true;
                        var response = prompt(npc.name + ': ' + npc.question);
                        if(response !== null && parseInt(response) === npc.answer){
                            alert('Correct! You earned a coin.');
                            npc.active = false;
                            coins++;
                        } else {
                            alert('Oops! That is not correct. Try again later.');
                        }
                    }
                } else {
                    npc.recentlyAsked = false;
                }
            }
        });
    }
    function draw(){
        ctx.fillStyle = '#88cc88';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#555555';
        ctx.fillRect(0, 400, canvas.width, 80);
        npcs.forEach(function(npc){
            if(npc.active){
                if(npc.type === 'add') ctx.fillStyle = '#ff99cc';
                else if(npc.type === 'sub') ctx.fillStyle = '#cccccc';
                else ctx.fillStyle = '#66ccff';
                ctx.beginPath();
                ctx.arc(npc.x, npc.y, npc.size, 0, Math.PI*2);
                ctx.fill();
                ctx.fillStyle = '#000000';
                ctx.font = '12px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(npc.name, npc.x, npc.y - npc.size - 5);
            }
        });
        ctx.fillStyle = '#0000ff';
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.size, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '16px Arial';
        ctx.fillText('Coins: ' + coins, 60, 425);
        ctx.fillStyle = '#000000';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Use arrow keys to explore and solve math puzzles!', canvas.width/2, 425);
    }
    function loop(){
        update();
        draw();
        requestAnimationFrame(loop);
    }
    loop();
})();