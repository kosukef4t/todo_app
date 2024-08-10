import express from "express";
import {PrismaClient} from "@prisma/client";
import bodyParser from "body-parser";
import { z } from "zod";
import cuid from "cuid";

const app = express();
const prisma = new PrismaClient();
const port = 3000;
app.use(bodyParser.json());

//タスクを取得 : LIKE検索, 期日の範囲検索
const getTodoSchema = z.object({
  search_title: z.string().optional(),
  search_body: z.string().optional(),
  dueDateStart: z.string().optional(),
  dueDateEnd: z.string().optional(),
  is_dueNull: z.string().optional()
});

app.get("/todos", async(req,res) =>{
  try{
    const result = getTodoSchema.safeParse(req.query);
    if(!result.success){
      res.status(400).json({error: result.error.errors[0].message});
    }else{
      const {search_title, search_body, dueDateStart, dueDateEnd, is_dueNull} = result.data;
      const dueStart = dueDateStart+"T00:00:00.000Z";
      const dueEnd = dueDateEnd+"T23:59:59.999Z";
      const todos = await prisma.todo.findMany({
        where: {
          ...(search_title && {title:{contains: search_title}}),
          ...(search_body && {body:{contains: search_body}}),
          ...(dueStart && dueEnd && {dueDate: {gte: dueStart,lte: dueEnd}}),
          ...(is_dueNull && {dueDate: null})
        },
        orderBy:{
          createdAt: "desc"
        }
      });
      res.json(todos);
    }
  }catch(error){
    res.status(500).json({error: "Internal Server Error"});
  }
});

//特定のタスクを取得
app.get("/todos/:id", async(req,res)=>{
  const { id } = req.params;
  const todo = await prisma.todo.findUnique({where:{id}});
  if(todo){
    res.json(todo);
  }else{
    res.status(404).json({message: "Todo not found"});
  }
});

//タスクの作成
const createTodoSchema = z.object({
  title: z.string().nonempty('タイトルを入力してください！'),
  body: z.string().optional(),
  dueDate: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '2024-01-01のようなフォーマットで入力してください')
    .refine(date => new Date(date).setHours(0,0,0,0) >= new Date().setHours(0,0,0,0), '今日以降の日付を選択してください')
    .optional(),
});

app.post("/todos", async(req,res) =>{
  const result = createTodoSchema.safeParse(req.body);

  if(!result.success){
    const error = result.error.errors[0];
    res.status(400).json({error: error.message});
  }else{
    const { title, body, dueDate } = result.data;
    const Newtodo = await prisma.todo.create({
      data: {
        title,
        body,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null
      },
    });
    res.status(201).json(Newtodo);
  }
});

//タスクの更新
const updateTodoSchema = z.object({
  title: z.string().optional(),
  body: z.string().optional(),
  dueDate: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '2024-01-01のようなフォーマットで入力してください')
    .refine(date => new Date(date).setHours(0,0,0,0) >= new Date().setHours(0,0,0,0), '今日以降の日付を選択してください')
    .optional(),
  completedAt: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '2024-01-01のようなフォーマットで入力してください')
    .optional()
});

app.patch("/todos/:id", async(req,res)=>{
  const result = updateTodoSchema.safeParse(req.body);
  const { id } = req.params;

  if(!result.success){
    res.status(400).json({error: result.error.errors[0].message});
  }else{
  const {title, body, dueDate, completedAt} = result.data;
  const todo = await prisma.todo.update({
    where:{ id },
    data:{
      title,
      body,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      completedAt: completedAt ? new Date(completedAt).toISOString() : null
    } 
  });
  if(todo){
    res.json(todo);
  }else{
    res.status(404).json({message: "Todo not found"});
  }
  }
});

//タスクの完了
app.patch("/todos/:id/is_completed", async(req,res)=>{
  const { id } = req.params;
  const now = new Date().toISOString();
  if(id){
    const todo = await prisma.todo.findUnique({where:{id}});
    if(todo){
      if(todo.completedAt === null){
        const updatedTodo = await prisma.todo.update({
          where:{id}, 
          data:{completedAt: now}
        });
        res.json(updatedTodo);
      }else{
        res.status(400).json({message: "タスクは既に完了しています"});
      }
    }else{
      res.status(404).json({message: "Todo not found"});
    }
  }
});


//タスクの削除
app.delete("/todos/:id", async(req,res)=>{
  const { id } = req.params;
  const todo = await prisma.todo.findUnique({
    where : { id }
  });
  if(todo){
    await prisma.todo.delete({where : {id}})
    res.status(204).send(); //削除してからのjsonを返す
  }else{
    res.status(404).json({message: "Todo not found"});
  };
});

//タスクの複製
app.post("/todos/:id/duplicate", async(req,res)=>{
  const { id } = req.params;
  const originalTodo = await prisma.todo.findUnique({where:{id}});
  if(originalTodo){
    const newTodo = await prisma.todo.create({
      data:{
        title: `${originalTodo.title}のコピー`,
        body: originalTodo.body,
        dueDate: null,
        completedAt: null
      }
    });
    res.status(201).json(newTodo);
  }else{
    res.status(404).json({message: "Task not found"});
  }
});

//サーバーの起動
app.listen(port, ()=>{
  console.log(`Server is running on port ${port}`);
});
